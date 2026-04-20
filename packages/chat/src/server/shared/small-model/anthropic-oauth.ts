import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { ANTHROPIC_AUTH_PROVIDER_ID } from "../auth-provider-ids";

const ANTHROPIC_OAUTH_TOKEN_URL =
	"https://console.anthropic.com/v1/oauth/token";

// Public Claude Code OAuth client_id. Mirrors what mastracode's anthropic
// provider uses so refreshed tokens remain compatible with the same auth.json
// entries mastracode writes. If Anthropic rotates this, OAuth refresh breaks
// for both us and mastracode simultaneously.
const CLAUDE_CODE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

const REFRESH_LEEWAY_MS = 30_000;
const REFRESH_TIMEOUT_MS = 10_000;

export const ANTHROPIC_OAUTH_HEADERS = {
	"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
	"user-agent": "claude-cli/2.1.2 (external, cli)",
	"x-app": "cli",
} as const;

export interface AnthropicOAuthCredential {
	accessToken: string;
}

interface AuthJsonOAuthEntry {
	type: "oauth";
	access: string;
	refresh: string;
	expires: number;
}

export type AuthDataReadResult =
	| { kind: "ok"; data: Record<string, unknown> }
	| { kind: "missing" }
	| { kind: "parse-error" };

/**
 * In-memory cache of the last-refreshed entry, used when the on-disk write
 * fails (read-only home dir, full disk, …). Without this, every small-model
 * call would re-refresh an expired token because the disk copy stays stale,
 * hammering Anthropic's OAuth endpoint.
 */
let cachedEntry: AuthJsonOAuthEntry | null = null;

/**
 * Resolves the mastracode auth.json path (same logic as mastracode's
 * `getAppDataDir`). We read it directly to avoid importing mastracode,
 * which eagerly loads @mastra/fastembed → onnxruntime-node (208 MB native
 * binary) and breaks electron-vite bundling.
 */
export function getAuthJsonPath(): string {
	const p = platform();
	let base: string;
	if (p === "darwin") {
		base = join(homedir(), "Library", "Application Support");
	} else if (p === "win32") {
		base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
	} else {
		base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	}
	return join(base, "mastracode", "auth.json");
}

export function readAuthJson(): AuthDataReadResult {
	const path = getAuthJsonPath();
	if (!existsSync(path)) return { kind: "missing" };
	try {
		const data = JSON.parse(readFileSync(path, "utf-8")) as Record<
			string,
			unknown
		>;
		return { kind: "ok", data };
	} catch {
		return { kind: "parse-error" };
	}
}

export function isOAuthEntry(value: unknown): value is AuthJsonOAuthEntry {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		(value as { type: unknown }).type === "oauth" &&
		"access" in value &&
		typeof (value as { access: unknown }).access === "string" &&
		"refresh" in value &&
		typeof (value as { refresh: unknown }).refresh === "string" &&
		"expires" in value &&
		typeof (value as { expires: unknown }).expires === "number"
	);
}

/**
 * Persist the refreshed entry. Reads auth.json immediately before writing to
 * minimise the window where a concurrent mastracode write to a different
 * provider slot could be lost. Aborts on parse errors (rather than starting
 * from `{}`) so we never wipe valid sibling slots when the file is mid-write
 * or transiently corrupt.
 *
 * The temp file is written into the SAME directory as the target. `renameSync`
 * across filesystems throws `EXDEV` on Linux where /tmp is commonly a `tmpfs`
 * mount separate from $HOME, which would silently prevent token persistence.
 */
function writeAnthropicEntry(entry: AuthJsonOAuthEntry): void {
	const path = getAuthJsonPath();
	const result = readAuthJson();
	if (result.kind === "parse-error") {
		throw new Error(
			"refusing to overwrite auth.json: existing content is unparseable",
		);
	}
	const current = result.kind === "ok" ? result.data : {};
	current[ANTHROPIC_AUTH_PROVIDER_ID] = entry;
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmpPath = join(dir, `.auth.json.${process.pid}-${Date.now()}.tmp`);
	const serialized = JSON.stringify(current, null, 2);
	writeFileSync(tmpPath, serialized, { mode: 0o600 });
	renameSync(tmpPath, path);
}

async function refreshAccessToken(
	refreshToken: string,
): Promise<AuthJsonOAuthEntry | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(ANTHROPIC_OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: CLAUDE_CODE_OAUTH_CLIENT_ID,
			}),
			signal: controller.signal,
		});
	} catch (error) {
		console.warn("[anthropic-oauth] refresh request failed:", error);
		return null;
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		console.warn(
			`[anthropic-oauth] refresh returned ${response.status}: ${body.slice(0, 200)}`,
		);
		return null;
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		console.warn("[anthropic-oauth] refresh response was not JSON:", error);
		return null;
	}

	if (
		typeof payload !== "object" ||
		payload === null ||
		!("access_token" in payload) ||
		typeof (payload as { access_token: unknown }).access_token !== "string"
	) {
		return null;
	}

	const accessToken = (payload as { access_token: string }).access_token;
	const newRefresh =
		"refresh_token" in payload &&
		typeof (payload as { refresh_token: unknown }).refresh_token === "string"
			? (payload as { refresh_token: string }).refresh_token
			: refreshToken;
	const expiresIn =
		"expires_in" in payload &&
		typeof (payload as { expires_in: unknown }).expires_in === "number"
			? (payload as { expires_in: number }).expires_in
			: 3600;

	return {
		type: "oauth",
		access: accessToken,
		refresh: newRefresh,
		expires: Date.now() + expiresIn * 1000,
	};
}

function isFresh(entry: AuthJsonOAuthEntry): boolean {
	return entry.expires - REFRESH_LEEWAY_MS > Date.now();
}

/**
 * Resolves an Anthropic OAuth access token from mastracode's auth.json,
 * refreshing it via the Claude Code OAuth flow when expired. Returns `null`
 * if no OAuth entry exists, refresh fails, or the refresh token is rejected
 * (in which case the user must re-auth via Settings → Models).
 *
 * `authData` may be passed in by callers that have already read auth.json to
 * avoid a second disk read; if omitted, this function reads it itself.
 */
export async function getAnthropicOAuthCredential(
	authData?: Record<string, unknown> | null,
): Promise<AnthropicOAuthCredential | null> {
	if (cachedEntry && isFresh(cachedEntry)) {
		return { accessToken: cachedEntry.access };
	}

	let resolvedAuthData: Record<string, unknown> | null;
	if (authData !== undefined) {
		resolvedAuthData = authData;
	} else {
		const result = readAuthJson();
		resolvedAuthData = result.kind === "ok" ? result.data : null;
	}
	if (!resolvedAuthData) return null;

	const entry = resolvedAuthData[ANTHROPIC_AUTH_PROVIDER_ID];
	if (!isOAuthEntry(entry)) return null;

	if (isFresh(entry)) {
		cachedEntry = entry;
		return { accessToken: entry.access };
	}

	const refreshed = await refreshAccessToken(entry.refresh);
	if (!refreshed) return null;

	cachedEntry = refreshed;
	try {
		writeAnthropicEntry(refreshed);
	} catch (error) {
		console.warn("[anthropic-oauth] failed to persist refreshed token:", error);
	}

	return { accessToken: refreshed.access };
}

/** Test-only — clear the in-memory refresh cache between cases. */
export function __resetCacheForTests(): void {
	cachedEntry = null;
}
