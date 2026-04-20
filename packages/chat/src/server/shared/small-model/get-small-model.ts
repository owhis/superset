import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	ANTHROPIC_AUTH_PROVIDER_ID,
	OPENAI_AUTH_PROVIDER_IDS,
} from "../auth-provider-ids";
import {
	ANTHROPIC_OAUTH_HEADERS,
	getAnthropicOAuthCredential,
	readAuthJson,
} from "./anthropic-oauth";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";

const MIN_API_KEY_LENGTH = 30;

type AuthData = Record<string, unknown>;

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

function resolveApiKeyForProvider(
	envVar: string | undefined,
	authData: AuthData | null,
	providerIds: readonly string[],
	validate: (key: string) => boolean,
): string | null {
	const env = envVar?.trim();
	if (env && validate(env)) return env;
	for (const providerId of providerIds) {
		const stored = getStoredApiKey(authData, providerId);
		if (stored && validate(stored)) return stored;
	}
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
 *   5. mastracode auth.json `apikey:openai-codex` / `apikey:openai` slots
 *
 * API keys are validated by prefix + minimum length so dev placeholders
 * (e.g. `ANTHROPIC_API_KEY=dummy` from a sample .env) fall through to the
 * next path instead of being sent to the API and failing 401.
 */
export async function getSmallModel(): Promise<unknown> {
	const authResult = readAuthJson();
	const authData = authResult.kind === "ok" ? authResult.data : null;

	const anthropicKey = resolveApiKeyForProvider(
		process.env.ANTHROPIC_API_KEY,
		authData,
		[ANTHROPIC_AUTH_PROVIDER_ID],
		isAnthropicApiKey,
	);
	if (anthropicKey) {
		return createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_SMALL_MODEL_ID);
	}

	const anthropicOAuth = await getAnthropicOAuthCredential(authData);
	if (anthropicOAuth) {
		return createAnthropic({
			authToken: anthropicOAuth.accessToken,
			headers: ANTHROPIC_OAUTH_HEADERS,
		})(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openaiKey = resolveApiKeyForProvider(
		process.env.OPENAI_API_KEY,
		authData,
		OPENAI_AUTH_PROVIDER_IDS,
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
