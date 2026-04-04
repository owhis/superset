import { describe, expect, test } from "bun:test";
import {
	buildAnthropicEnvText,
	EMPTY_ANTHROPIC_FORM,
	parseAnthropicForm,
} from "./utils";

describe("parseAnthropicForm", () => {
	test("extracts known keys with non-empty values", () => {
		const result = parseAnthropicForm(
			"ANTHROPIC_API_KEY=sk-123\nANTHROPIC_AUTH_TOKEN=tok\nANTHROPIC_BASE_URL=https://example.com",
		);
		expect(result.apiKey).toBe("sk-123");
		expect(result.authToken).toBe("tok");
		expect(result.baseUrl).toBe("https://example.com");
		expect(result.extraEnv).toBe("");
	});

	test("puts unknown keys in extraEnv", () => {
		const result = parseAnthropicForm(
			"ANTHROPIC_API_KEY=sk-123\nCLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-west-2",
		);
		expect(result.apiKey).toBe("sk-123");
		expect(result.extraEnv).toBe(
			"CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-west-2",
		);
	});

	test("keeps known keys with empty values in extraEnv", () => {
		const result = parseAnthropicForm("ANTHROPIC_API_KEY=");
		expect(result.apiKey).toBe("");
		expect(result.extraEnv).toBe("ANTHROPIC_API_KEY=");
	});

	test("keeps ANTHROPIC_AUTH_TOKEN with empty value in extraEnv", () => {
		const result = parseAnthropicForm("ANTHROPIC_AUTH_TOKEN=");
		expect(result.authToken).toBe("");
		expect(result.extraEnv).toBe("ANTHROPIC_AUTH_TOKEN=");
	});

	test("keeps ANTHROPIC_BASE_URL with empty value in extraEnv", () => {
		const result = parseAnthropicForm("ANTHROPIC_BASE_URL=");
		expect(result.baseUrl).toBe("");
		expect(result.extraEnv).toBe("ANTHROPIC_BASE_URL=");
	});

	test("returns empty form for empty input", () => {
		const result = parseAnthropicForm("");
		expect(result).toEqual(EMPTY_ANTHROPIC_FORM);
	});
});

describe("buildAnthropicEnvText", () => {
	test("includes keys with non-empty values", () => {
		const result = buildAnthropicEnvText({
			apiKey: "sk-123",
			authToken: "",
			baseUrl: "",
			extraEnv: "",
		});
		expect(result).toBe("ANTHROPIC_API_KEY=sk-123");
	});

	test("includes extraEnv", () => {
		const result = buildAnthropicEnvText({
			apiKey: "",
			authToken: "",
			baseUrl: "",
			extraEnv: "CLAUDE_CODE_USE_BEDROCK=1",
		});
		expect(result).toBe("CLAUDE_CODE_USE_BEDROCK=1");
	});

	test("returns empty string when all values are empty", () => {
		const result = buildAnthropicEnvText(EMPTY_ANTHROPIC_FORM);
		expect(result).toBe("");
	});
});

describe("roundtrip: parseAnthropicForm -> buildAnthropicEnvText", () => {
	test("preserves ANTHROPIC_API_KEY= (empty value) through roundtrip", () => {
		const input =
			"CLAUDE_CODE_USE_BEDROCK=1\nANTHROPIC_API_KEY=\nAWS_REGION=us-west-2";
		const parsed = parseAnthropicForm(input);
		const rebuilt = buildAnthropicEnvText(parsed);
		expect(rebuilt).toContain("ANTHROPIC_API_KEY=");
		expect(rebuilt).toContain("CLAUDE_CODE_USE_BEDROCK=1");
		expect(rebuilt).toContain("AWS_REGION=us-west-2");
	});

	test("preserves Bedrock config with empty ANTHROPIC_API_KEY", () => {
		const input =
			"CLAUDE_CODE_USE_BEDROCK=1\nAWS_BEARER_TOKEN_BEDROCK=secret\nAWS_REGION=us-west-2\nANTHROPIC_API_KEY=";
		const parsed = parseAnthropicForm(input);
		const rebuilt = buildAnthropicEnvText(parsed);
		expect(rebuilt).toContain("ANTHROPIC_API_KEY=");
		expect(rebuilt).toContain("CLAUDE_CODE_USE_BEDROCK=1");
		expect(rebuilt).toContain("AWS_BEARER_TOKEN_BEDROCK=secret");
		expect(rebuilt).toContain("AWS_REGION=us-west-2");
	});

	test("preserves non-empty known key values through roundtrip", () => {
		const input =
			"ANTHROPIC_API_KEY=sk-123\nANTHROPIC_BASE_URL=https://example.com";
		const parsed = parseAnthropicForm(input);
		const rebuilt = buildAnthropicEnvText(parsed);
		expect(rebuilt).toContain("ANTHROPIC_API_KEY=sk-123");
		expect(rebuilt).toContain("ANTHROPIC_BASE_URL=https://example.com");
	});
});
