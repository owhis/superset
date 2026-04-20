import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	__resetCacheForTests,
	__resetIOForTests,
	__setIOForTests,
	getAnthropicOAuthCredential,
	isOAuthEntry,
} from "./anthropic-oauth";
import type { AuthDataReadResult } from "./auth-storage-io";

const ioMock = {
	readAuthJson: mock<() => AuthDataReadResult>(() => ({ kind: "missing" })),
	writeAuthJson: mock<(next: Record<string, unknown>) => void>(() => {}),
};

const originalFetch = globalThis.fetch;

function mockAuthJson(contents: Record<string, unknown> | null): void {
	if (contents === null) {
		ioMock.readAuthJson.mockReturnValue({ kind: "missing" });
	} else {
		ioMock.readAuthJson.mockReturnValue({ kind: "ok", data: contents });
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
		ioMock.readAuthJson.mockReset();
		ioMock.readAuthJson.mockReturnValue({ kind: "missing" });
		ioMock.writeAuthJson.mockReset();
		__setIOForTests(ioMock);
		__resetCacheForTests();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		__resetIOForTests();
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
		expect(ioMock.writeAuthJson).not.toHaveBeenCalled();
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
		expect(ioMock.writeAuthJson).toHaveBeenCalledTimes(1);

		const written = ioMock.writeAuthJson.mock.calls[0]?.[0] as {
			anthropic: { access: string; refresh: string; expires: number };
		};
		expect(written.anthropic.access).toBe("sk-ant-oat-fresh");
		expect(written.anthropic.refresh).toBe("rt-new");
		expect(written.anthropic.expires).toBeGreaterThan(Date.now());
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

		const written = ioMock.writeAuthJson.mock.calls[0]?.[0] as {
			anthropic: { refresh: string };
		};
		expect(written.anthropic.refresh).toBe("rt-keep");
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
		expect(ioMock.writeAuthJson).not.toHaveBeenCalled();
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

		const written = ioMock.writeAuthJson.mock.calls[0]?.[0] as {
			anthropic: { access: string };
			"openai-codex": { access: string };
		};
		expect(written.anthropic.access).toBe("sk-ant-oat-fresh");
		expect(written["openai-codex"].access).toBe("openai-token");
	});

	it("aborts persistence when auth.json is unparseable", async () => {
		ioMock.readAuthJson.mockReturnValue({ kind: "parse-error" });
		mockFetch(async () =>
			Response.json({ access_token: "sk-ant-oat-fresh", expires_in: 3600 }),
		);

		const result = await getAnthropicOAuthCredential();

		expect(result).toBeNull();
		expect(ioMock.writeAuthJson).not.toHaveBeenCalled();
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

		const written = ioMock.writeAuthJson.mock.calls[0]?.[0] as {
			anthropic: { expires: number };
		};
		expect(written.anthropic.expires).toBeGreaterThanOrEqual(
			before + 3600 * 1000,
		);
		expect(written.anthropic.expires).toBeLessThanOrEqual(after + 3600 * 1000);
	});

	it("refreshes a token within the leeway window", async () => {
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
		ioMock.writeAuthJson.mockImplementationOnce(() => {
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
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("returns null when refresh is aborted by timeout", async () => {
		mockAuthJson({
			anthropic: {
				type: "oauth",
				access: "sk-ant-oat-stale",
				refresh: "rt-xxx",
				expires: Date.now() - 60_000,
			},
		});
		mockFetch(async (_input, init) => {
			return await new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					const err = new Error("aborted");
					err.name = "AbortError";
					reject(err);
				});
			});
		});

		const originalSetTimeout = globalThis.setTimeout;
		globalThis.setTimeout = ((fn: () => void) => {
			queueMicrotask(fn);
			return 0 as unknown as ReturnType<typeof originalSetTimeout>;
		}) as typeof globalThis.setTimeout;
		try {
			expect(await getAnthropicOAuthCredential()).toBeNull();
		} finally {
			globalThis.setTimeout = originalSetTimeout;
		}
	});
});
