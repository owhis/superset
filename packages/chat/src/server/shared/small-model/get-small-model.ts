import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	ANTHROPIC_OAUTH_HEADERS,
	getAnthropicOAuthCredential,
} from "./anthropic-oauth";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";

/**
 * Resolves the mastracode auth.json path (same logic as mastracode's
 * `getAppDataDir`). We read it directly to avoid importing mastracode,
 * which eagerly loads @mastra/fastembed → onnxruntime-node (208 MB native
 * binary) and breaks electron-vite bundling.
 */
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

type AuthData = Record<string, unknown>;

function readAuthData(): AuthData | null {
	const path = getAuthJsonPath();
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as AuthData;
	} catch {
		return null;
	}
}

function getStoredApiKey(
	authData: AuthData | null,
	providerId: string,
): string | null {
	if (!authData) return null;
	const entry = authData[`apikey:${providerId}`];
	if (
		typeof entry === "object" &&
		entry !== null &&
		"type" in entry &&
		entry.type === "api_key" &&
		"key" in entry &&
		typeof entry.key === "string" &&
		entry.key.trim().length > 0
	) {
		return entry.key.trim();
	}
	return null;
}

function resolveApiKey(
	envVar: string | undefined,
	authData: AuthData | null,
	providerId: string,
	validate: (key: string) => boolean,
): string | null {
	const env = envVar?.trim();
	if (env && validate(env)) return env;
	const stored = getStoredApiKey(authData, providerId);
	if (stored && validate(stored)) return stored;
	return null;
}

/** Real Anthropic API keys start with `sk-ant-api`. Filters out dev placeholders like "dummy". */
function isAnthropicApiKey(key: string): boolean {
	return key.startsWith("sk-ant-api");
}

/** Real OpenAI keys start with `sk-`. Filters out dev placeholders like "dummy". */
function isOpenAIApiKey(key: string): boolean {
	return key.startsWith("sk-");
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Tries Anthropic (API key → OAuth) first, falls back
 * to OpenAI. Returns `null` if no credentials are available.
 *
 * Anthropic resolution order:
 *   1. ANTHROPIC_API_KEY env var
 *   2. mastracode auth.json `apikey:anthropic` slot
 *   3. mastracode auth.json `anthropic` OAuth slot (refreshed if expired)
 *
 * Refreshing OAuth tokens is done via direct HTTP against
 * console.anthropic.com — we don't import mastracode here because it pulls
 * in onnxruntime-node (208 MB native binary) and breaks electron-vite
 * bundling.
 */
export async function getSmallModel(): Promise<unknown | null> {
	const authData = readAuthData();

	const anthropicKey = resolveApiKey(
		process.env.ANTHROPIC_API_KEY,
		authData,
		"anthropic",
		isAnthropicApiKey,
	);
	if (anthropicKey) {
		console.log("[get-small-model] using Anthropic API key");
		return createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_SMALL_MODEL_ID);
	}

	const anthropicOAuth = await getAnthropicOAuthCredential();
	if (anthropicOAuth) {
		console.log("[get-small-model] using Anthropic OAuth");
		return createAnthropic({
			authToken: anthropicOAuth.accessToken,
			headers: { ...ANTHROPIC_OAUTH_HEADERS },
		})(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openaiKey = resolveApiKey(
		process.env.OPENAI_API_KEY,
		authData,
		"openai",
		isOpenAIApiKey,
	);
	if (openaiKey) {
		console.log("[get-small-model] using OpenAI API key");
		return createOpenAI({ apiKey: openaiKey }).chat(OPENAI_SMALL_MODEL_ID);
	}

	console.warn(
		"[get-small-model] no credentials found — fallback will be used. " +
			`authData=${authData ? "present" : "missing"}, ` +
			`anthropicEnv=${process.env.ANTHROPIC_API_KEY ? "set" : "unset"}, ` +
			`openaiEnv=${process.env.OPENAI_API_KEY ? "set" : "unset"}, ` +
			`anthropicEntryKeys=${authData?.anthropic ? Object.keys(authData.anthropic as Record<string, unknown>).join(",") : "none"}`,
	);
	return null;
}
