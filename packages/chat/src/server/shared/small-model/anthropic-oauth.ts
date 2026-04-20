import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";

const ANTHROPIC_OAUTH_TOKEN_URL =
	"https://console.anthropic.com/v1/oauth/token";

const CLAUDE_CODE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

const REFRESH_LEEWAY_MS = 30_000;

export interface AnthropicOAuthHeaders {
	"anthropic-beta": string;
	"user-agent": string;
	"x-app": string;
}

export const ANTHROPIC_OAUTH_HEADERS: AnthropicOAuthHeaders = {
	"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
	"user-agent": "claude-cli/2.1.2 (external, cli)",
	"x-app": "cli",
};

export interface AnthropicOAuthCredential {
	accessToken: string;
}

interface AuthJsonOAuthEntry {
	type: "oauth";
	access: string;
	refresh: string;
	expires: number;
}

function getAuthJsonPath(): string {
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

function readAuthJson(): Record<string, unknown> | null {
	const path = getAuthJsonPath();
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function isOAuthEntry(value: unknown): value is AuthJsonOAuthEntry {
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
 * Persist the refreshed entry by reading the current file, replacing the
 * provider's slot, and atomically renaming a temp file into place. Concurrent
 * writes from mastracode in another process can lose this update — acceptable
 * because the next call will just refresh again with the latest stored token.
 */
function writeAnthropicEntry(entry: AuthJsonOAuthEntry): void {
	const path = getAuthJsonPath();
	const current = readAuthJson() ?? {};
	current.anthropic = entry;
	const serialized = JSON.stringify(current, null, 2);
	const tmpPath = join(
		tmpdir(),
		`mastracode-auth-${process.pid}-${Date.now()}.json`,
	);
	writeFileSync(tmpPath, serialized, { mode: 0o600 });
	renameSync(tmpPath, path);
}

async function refreshAccessToken(
	refreshToken: string,
): Promise<AuthJsonOAuthEntry | null> {
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
		});
	} catch (error) {
		console.warn("[anthropic-oauth] refresh request failed:", error);
		return null;
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

/**
 * Resolves an Anthropic OAuth access token from mastracode's auth.json,
 * refreshing it via the Claude Code OAuth flow when expired. Returns `null`
 * if no OAuth entry exists, refresh fails, or the refresh token is rejected
 * (in which case the user must re-auth via Settings → Models).
 */
export async function getAnthropicOAuthCredential(): Promise<AnthropicOAuthCredential | null> {
	const authData = readAuthJson();
	if (!authData) return null;

	const entry = authData.anthropic;
	if (!isOAuthEntry(entry)) return null;

	if (entry.expires - REFRESH_LEEWAY_MS > Date.now()) {
		return { accessToken: entry.access };
	}

	const refreshed = await refreshAccessToken(entry.refresh);
	if (!refreshed) return null;

	try {
		writeAnthropicEntry(refreshed);
	} catch (error) {
		console.warn("[anthropic-oauth] failed to persist refreshed token:", error);
	}

	return { accessToken: refreshed.access };
}
