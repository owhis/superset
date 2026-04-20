import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";

// `mock.module("node:fs")` is process-global in bun:test. This file is the
// only test that exercises file I/O in this directory, so leakage isn't an
// issue today; if a sibling test starts importing `getAnthropicOAuthCredential`
// (or anything that transitively reads node:fs) it will inherit this mock.
const fsMock = {
	existsSync: mock<(path: string) => boolean>(() => false),
	readFileSync: mock<(path: string, encoding: string) => string>(() => ""),
	writeFileSync: mock<(path: string, data: string, options?: unknown) => void>(
		() => {},
	),
	renameSync: mock<(from: string, to: string) => void>(() => {}),
};

mock.module("node:fs", () => fsMock);

const { __resetCacheForTests, getAnthropicOAuthCredential, isOAuthEntry } =
	await import("./anthropic-oauth");

const originalFetch = globalThis.fetch;

function mockAuthJson(contents: Record<string, unknown> | null): void {
	fsMock.existsSync.mockReturnValue(contents !== null);
	if (contents !== null) {
		fsMock.readFileSync.mockReturnValue(JSON.stringify(contents));
	}
}

function mockFetch(
	impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): void {
	globalThis.fetch = mock(impl) as typeof globalThis.fetch;
}

describe("isOAuthEntry", () => {
	it("accepts a well-formed mastracode OAuth entry", () => {
		expect(
			isOAuthEntry({
				type: "oauth",
				access: "sk-ant-oat-xxx",
				refresh: "rt-xxx",
				expires: 1_776_000_000_000,
			}),
		).toBe(true);
	});

	it("rejects api_key entries", () => {
		expect(
			isOAuthEntry({
				type: "api_key",
				key: "sk-ant-api03-xxx",
			}),
		).toBe(false);
	});

	it("rejects entries missing required fields", () => {
		expect(isOAuthEntry({ type: "oauth", access: "x", refresh: "y" })).toBe(
			false,
		);
		expect(isOAuthEntry({ type: "oauth", access: "x", expires: 1 })).toBe(
			false,
		);
		expect(isOAuthEntry({ type: "oauth", refresh: "y", expires: 1 })).toBe(
			false,
		);
	});

	it("rejects entries with wrong field types", () => {
		expect(
			isOAuthEntry({
				type: "oauth",
				access: "x",
				refresh: "y",
				expires: "soon",
			}),
		).toBe(false);
		expect(
			isOAuthEntry({ type: "oauth", access: 42, refresh: "y", expires: 1 }),
		).toBe(false);
	});

	it("rejects null, undefined, and primitives", () => {
		expect(isOAuthEntry(null)).toBe(false);
		expect(isOAuthEntry(undefined)).toBe(false);
		expect(isOAuthEntry("oauth")).toBe(false);
		expect(isOAuthEntry(42)).toBe(false);
	});
});

describe("getAnthropicOAuthCredential", () => {
	beforeEach(() => {
		fsMock.existsSync.mockReset();
		fsMock.readFileSync.mockReset();
		fsMock.writeFileSync.mockReset();
		fsMock.renameSync.mockReset();
		__resetCacheForTests();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns null when auth.json does not exist", async () => {
		mockAuthJson(null);
		expect(await getAnthropicOAuthCredential()).toBeNull();
	});

	it("returns null when no anthropic entry is present", async () => {
		mockAuthJson({ "openai-codex": { type: "oauth", access: "x" } });
		expect(await getAnthropicOAuthCredential()).toBeNull();
	});

	it("returns null when the anthropic entry is api_key, not oauth", async () => {
		mockAuthJson({ anthropic: { type: "api_key", key: "sk-ant-api03-xxx" } });
		expect(await getAnthropicOAuthCredential()).toBeNull();
	});

	it("returns the stored access token when not expired", async () => {
		const farFuture = Date.now() + 60 * 60 * 1000;
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-valid",
				refresh: "rt-xxx",
				expires: farFuture,
			},
		});

		const result = await getAnthropicOAuthCredential();

		expect(result).toEqual({ accessToken: "sk-ant-oat-valid" });
		// No refresh call should have happened.
		expect(fsMock.writeFileSync).not.toHaveBeenCalled();
	});

	it("refreshes an expired token and persists the new entry", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-old",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(async () =>
			Response.json({
				access_token: "sk-ant-oat-fresh",
				refresh_token: "rt-new",
				expires_in: 3600,
			}),
		);

		const result = await getAnthropicOAuthCredential();

		expect(result).toEqual({ accessToken: "sk-ant-oat-fresh" });
		expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1);
		expect(fsMock.renameSync).toHaveBeenCalledTimes(1);

		// Persisted JSON should carry the refreshed access + refresh + future expiry.
		const written = fsMock.writeFileSync.mock.calls[0]?.[1] as string;
		const parsed = JSON.parse(written) as {
			anthropic: { access: string; refresh: string; expires: number };
		};
		expect(parsed.anthropic.access).toBe("sk-ant-oat-fresh");
		expect(parsed.anthropic.refresh).toBe("rt-new");
		expect(parsed.anthropic.expires).toBeGreaterThan(Date.now());
	});

	it("falls back to the original refresh token when the response omits one", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-keep",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(async () =>
			Response.json({
				access_token: "sk-ant-oat-fresh",
				expires_in: 3600,
			}),
		);

		await getAnthropicOAuthCredential();

		const written = fsMock.writeFileSync.mock.calls[0]?.[1] as string;
		const parsed = JSON.parse(written) as {
			anthropic: { refresh: string };
		};
		expect(parsed.anthropic.refresh).toBe("rt-keep");
	});

	it("returns null when refresh returns a 4xx", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-bad",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(
			async () =>
				new Response('{"error":"invalid_grant"}', {
					status: 400,
					headers: { "content-type": "application/json" },
				}),
		);

		expect(await getAnthropicOAuthCredential()).toBeNull();
		expect(fsMock.writeFileSync).not.toHaveBeenCalled();
	});

	it("returns null when refresh response is missing access_token", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-xxx",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(async () => Response.json({ no_access_token: true }));

		expect(await getAnthropicOAuthCredential()).toBeNull();
	});

	it("returns null when fetch throws", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-xxx",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(async () => {
			throw new Error("network down");
		});

		expect(await getAnthropicOAuthCredential()).toBeNull();
	});

	it("preserves unrelated provider slots when persisting refreshed token", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-old",
				expires: Date.now() - 60_000,
			},
			"openai-codex": {
				type: "oauth",
				access: "openai-token",
				refresh: "openai-rt",
				expires: Date.now() + 60 * 60 * 1000,
			},
		});
		mockFetch(async () =>
			Response.json({
				access_token: "sk-ant-oat-fresh",
				refresh_token: "rt-new",
				expires_in: 3600,
			}),
		);

		await getAnthropicOAuthCredential();

		const written = fsMock.writeFileSync.mock.calls[0]?.[1] as string;
		const parsed = JSON.parse(written) as {
			anthropic: { access: string };
			"openai-codex": { access: string };
		};
		expect(parsed.anthropic.access).toBe("sk-ant-oat-fresh");
		expect(parsed["openai-codex"].access).toBe("openai-token");
	});

	it("aborts persistence (and refresh write) when auth.json is unparseable", async () => {
		// File exists but contains invalid JSON. Without the parse-error guard
		// this would silently overwrite the file with just { anthropic: ... },
		// destroying every other provider slot.
		fsMock.existsSync.mockReturnValue(true);
		fsMock.readFileSync.mockReturnValue("{not valid json");
		mockFetch(async () =>
			Response.json({ access_token: "sk-ant-oat-fresh", expires_in: 3600 }),
		);

		const result = await getAnthropicOAuthCredential();

		// Read returns parse-error → no entry to refresh from → null.
		expect(result).toBeNull();
		expect(fsMock.writeFileSync).not.toHaveBeenCalled();
	});

	it("defaults expires_in to 3600s when the response omits it", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-xxx",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(async () => Response.json({ access_token: "sk-ant-oat-fresh" }));

		const before = Date.now();
		await getAnthropicOAuthCredential();
		const after = Date.now();

		const written = fsMock.writeFileSync.mock.calls[0]?.[1] as string;
		const parsed = JSON.parse(written) as { anthropic: { expires: number } };
		// Expiry should land roughly one hour from now.
		expect(parsed.anthropic.expires).toBeGreaterThanOrEqual(
			before + 3600 * 1000,
		);
		expect(parsed.anthropic.expires).toBeLessThanOrEqual(after + 3600 * 1000);
	});

	it("refreshes a token within the leeway window", async () => {
		// Token expires in 10s — inside the 30s leeway, so we still refresh.
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-leeway",
				refresh: "rt-xxx",
				expires: Date.now() + 10_000,
			},
		});
		const fetchMock = mock(async () =>
			Response.json({ access_token: "sk-ant-oat-fresh", expires_in: 3600 }),
		);
		globalThis.fetch = fetchMock as typeof globalThis.fetch;

		const result = await getAnthropicOAuthCredential();

		expect(result).toEqual({ accessToken: "sk-ant-oat-fresh" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("serves the cached entry when persistence fails (no refresh churn)", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-xxx",
				expires: Date.now() - 60_000,
			},
		});
		// First call: refresh succeeds, write throws.
		fsMock.writeFileSync.mockImplementationOnce(() => {
			throw new Error("EROFS: read-only file system");
		});
		const fetchMock = mock(async () =>
			Response.json({ access_token: "sk-ant-oat-fresh", expires_in: 3600 }),
		);
		globalThis.fetch = fetchMock as typeof globalThis.fetch;

		const first = await getAnthropicOAuthCredential();
		const second = await getAnthropicOAuthCredential();

		expect(first?.accessToken).toBe("sk-ant-oat-fresh");
		expect(second?.accessToken).toBe("sk-ant-oat-fresh");
		// Second call must NOT have hit the OAuth endpoint again.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

afterAll(() => {
	mock.restore();
});
