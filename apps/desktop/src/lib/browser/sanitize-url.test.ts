import { describe, expect, test } from "bun:test";
import { sanitizeUrl } from "./sanitize-url";

describe("sanitizeUrl", () => {
	// ---- file:// URLs (issue #3286) ------------------------------------
	test("preserves file:// URLs unchanged", () => {
		expect(sanitizeUrl("file:///home/user/index.html")).toBe(
			"file:///home/user/index.html",
		);
	});

	test("preserves file:// URL with spaces and query params", () => {
		expect(sanitizeUrl("file:///tmp/my%20file.html?a=1")).toBe(
			"file:///tmp/my%20file.html?a=1",
		);
	});

	test("preserves Windows-style file:// URL", () => {
		expect(sanitizeUrl("file:///C:/Users/test/page.html")).toBe(
			"file:///C:/Users/test/page.html",
		);
	});

	// ---- http / https --------------------------------------------------
	test("preserves http URLs", () => {
		expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
	});

	test("preserves https URLs", () => {
		expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
	});

	test("preserves HTTPS URLs (case-insensitive)", () => {
		expect(sanitizeUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
	});

	// ---- about: --------------------------------------------------------
	test("preserves about: URLs", () => {
		expect(sanitizeUrl("about:blank")).toBe("about:blank");
	});

	// ---- localhost / 127.0.0.1 -----------------------------------------
	test("prefixes localhost with http://", () => {
		expect(sanitizeUrl("localhost:3000")).toBe("http://localhost:3000");
	});

	test("prefixes 127.0.0.1 with http://", () => {
		expect(sanitizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
	});

	// ---- domain-like input (contains a dot) ----------------------------
	test("prefixes domain-like input with https://", () => {
		expect(sanitizeUrl("example.com")).toBe("https://example.com");
	});

	// ---- fallback to Google search -------------------------------------
	test("falls back to Google search for plain text", () => {
		expect(sanitizeUrl("how to cook pasta")).toBe(
			"https://www.google.com/search?q=how%20to%20cook%20pasta",
		);
	});
});
