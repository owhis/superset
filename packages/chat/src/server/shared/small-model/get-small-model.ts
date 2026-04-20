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

// Mastracode stores the OpenAI Codex provider under "openai-codex", not "openai".
// See packages/chat/src/server/desktop/auth/provider-ids.ts.
const OPENAI_PROVIDER_ID = "openai-codex";
const ANTHROPIC_PROVIDER_ID = "anthropic";

const MIN_API_KEY_LENGTH = 30;

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

/**
 * Anthropic API keys are issued in the form `sk-ant-api…` (currently
 * `sk-ant-api03-…`). Reject anything else — most importantly OAuth access
 * tokens (`sk-ant-oat…`), which Anthropic rejects when sent as `x-api-key`,
 * and dev placeholders like `dummy`.
 */
export function isAnthropicApiKey(key: string): boolean {
	return key.startsWith("sk-ant-api") && key.length >= MIN_API_KEY_LENGTH;
}

/**
 * OpenAI keys all start with `sk-` (legacy `sk-…`, project `sk-proj-…`,
 * service-account `sk-svcacct-…`). The length floor catches placeholders.
 */
export function isOpenAIApiKey(key: string): boolean {
	return key.startsWith("sk-") && key.length >= MIN_API_KEY_LENGTH;
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Returns `null` if no usable credentials are available.
 *
 * Resolution order:
 *   1. ANTHROPIC_API_KEY env var
 *   2. mastracode auth.json `apikey:anthropic` slot
 *   3. mastracode auth.json `anthropic` OAuth slot (refreshed if expired)
 *   4. OPENAI_API_KEY env var
 *   5. mastracode auth.json `apikey:openai-codex` slot
 *
 * API keys are validated by prefix + minimum length so dev placeholders
 * (e.g. `ANTHROPIC_API_KEY=dummy` from a sample .env) fall through to the
 * next path instead of being sent to the API and failing 401.
 *
 * OAuth refresh is done via direct HTTP against console.anthropic.com — we
 * don't import mastracode here because it pulls in onnxruntime-node (208 MB
 * native binary) and breaks electron-vite bundling.
 */
export async function getSmallModel(): Promise<unknown> {
	const authData = readAuthData();

	const anthropicKey = resolveApiKey(
		process.env.ANTHROPIC_API_KEY,
		authData,
		ANTHROPIC_PROVIDER_ID,
		isAnthropicApiKey,
	);
	if (anthropicKey) {
		return createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_SMALL_MODEL_ID);
	}

	const anthropicOAuth = await getAnthropicOAuthCredential();
	if (anthropicOAuth) {
		return createAnthropic({
			authToken: anthropicOAuth.accessToken,
			headers: ANTHROPIC_OAUTH_HEADERS,
		})(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openaiKey = resolveApiKey(
		process.env.OPENAI_API_KEY,
		authData,
		OPENAI_PROVIDER_ID,
		isOpenAIApiKey,
	);
	if (openaiKey) {
		return createOpenAI({ apiKey: openaiKey }).chat(OPENAI_SMALL_MODEL_ID);
	}

	console.warn(
		"[get-small-model] no credentials found — naming will fall back. " +
			`authData=${authData ? "present" : "missing"}, ` +
			`anthropicEnv=${process.env.ANTHROPIC_API_KEY ? "set" : "unset"}, ` +
			`openaiEnv=${process.env.OPENAI_API_KEY ? "set" : "unset"}`,
	);
	return null;
}
