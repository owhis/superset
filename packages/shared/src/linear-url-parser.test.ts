import { describe, expect, test } from "bun:test";
import { parseLinearIssueIdentifier } from "./linear-url-parser";

describe("parseLinearIssueIdentifier", () => {
	describe("valid Linear URLs", () => {
		test("parses basic Linear URL with issue identifier", () => {
			const url = "https://linear.app/superset-sh/issue/SUPER-387/test-issue";
			expect(parseLinearIssueIdentifier(url)).toBe("SUPER-387");
		});

		test("parses URL without trailing path", () => {
			const url = "https://linear.app/superset-sh/issue/SUPER-387";
			expect(parseLinearIssueIdentifier(url)).toBe("SUPER-387");
		});

		test("parses URL with different workspace name", () => {
			const url = "https://linear.app/my-company/issue/ABC-123/feature-request";
			expect(parseLinearIssueIdentifier(url)).toBe("ABC-123");
		});

		test("parses URL with multi-character team code", () => {
			const url = "https://linear.app/workspace/issue/TEAM-9999/long-title-here";
			expect(parseLinearIssueIdentifier(url)).toBe("TEAM-9999");
		});

		test("parses URL with single-character team code", () => {
			const url = "https://linear.app/workspace/issue/A-1/issue";
			expect(parseLinearIssueIdentifier(url)).toBe("A-1");
		});

		test("parses URL with query parameters", () => {
			const url =
				"https://linear.app/superset-sh/issue/SUPER-387?param=value&other=test";
			expect(parseLinearIssueIdentifier(url)).toBe("SUPER-387");
		});

		test("parses URL with hash fragment", () => {
			const url =
				"https://linear.app/superset-sh/issue/SUPER-387/title#comment-123";
			expect(parseLinearIssueIdentifier(url)).toBe("SUPER-387");
		});

		test("parses URL without https protocol", () => {
			const url = "http://linear.app/workspace/issue/TEST-42/issue";
			expect(parseLinearIssueIdentifier(url)).toBe("TEST-42");
		});

		test("parses URL without protocol", () => {
			const url = "linear.app/workspace/issue/TEST-42/issue";
			expect(parseLinearIssueIdentifier(url)).toBe("TEST-42");
		});
	});

	describe("invalid inputs", () => {
		test("returns null for non-Linear URL", () => {
			const url = "https://github.com/org/repo/issues/123";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});

		test("returns null for Linear URL without issue identifier", () => {
			const url = "https://linear.app/superset-sh/settings";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});

		test("returns null for malformed issue identifier (lowercase)", () => {
			const url = "https://linear.app/workspace/issue/super-387/title";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});

		test("returns null for malformed issue identifier (no hyphen)", () => {
			const url = "https://linear.app/workspace/issue/SUPER387/title";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});

		test("returns null for malformed issue identifier (no number)", () => {
			const url = "https://linear.app/workspace/issue/SUPER-/title";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});

		test("returns null for empty string", () => {
			expect(parseLinearIssueIdentifier("")).toBeNull();
		});

		test("returns null for plain text", () => {
			expect(parseLinearIssueIdentifier("SUPER-387")).toBeNull();
		});

		test("returns null for partial URL", () => {
			const url = "linear.app/issue/SUPER-387";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});

		test("returns null for URL with wrong path structure", () => {
			const url = "https://linear.app/SUPER-387";
			expect(parseLinearIssueIdentifier(url)).toBeNull();
		});
	});

	describe("edge cases", () => {
		test("extracts first match if multiple patterns exist", () => {
			const url =
				"Check https://linear.app/workspace/issue/FIRST-1/title and https://linear.app/workspace/issue/SECOND-2/title";
			expect(parseLinearIssueIdentifier(url)).toBe("FIRST-1");
		});

		test("handles URL with special characters in title", () => {
			const url =
				"https://linear.app/workspace/issue/TEST-1/title-with-special-chars-!@#";
			expect(parseLinearIssueIdentifier(url)).toBe("TEST-1");
		});

		test("handles URL embedded in text", () => {
			const text =
				"Please check https://linear.app/superset-sh/issue/SUPER-387/bug-fix for details";
			expect(parseLinearIssueIdentifier(text)).toBe("SUPER-387");
		});
	});
});
