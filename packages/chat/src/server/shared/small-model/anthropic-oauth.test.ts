import { describe, expect, it } from "bun:test";
import { isOAuthEntry } from "./anthropic-oauth";

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
			isOAuthEntry({
				type: "oauth",
				access: 42,
				refresh: "y",
				expires: 1,
			}),
		).toBe(false);
	});

	it("rejects null, undefined, and primitives", () => {
		expect(isOAuthEntry(null)).toBe(false);
		expect(isOAuthEntry(undefined)).toBe(false);
		expect(isOAuthEntry("oauth")).toBe(false);
		expect(isOAuthEntry(42)).toBe(false);
	});
});
