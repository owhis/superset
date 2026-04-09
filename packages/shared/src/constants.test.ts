import { describe, expect, test } from "bun:test";
import { COMPANY, DOWNLOAD_URL_MAC_ARM64 } from "./constants";

describe("DOWNLOAD_URL_MAC_ARM64", () => {
	test("should not use /releases/latest/ which resolves to the wrong release type", () => {
		// GitHub's /releases/latest always points to the most recent non-prerelease,
		// non-draft release. When a non-desktop release (e.g. CLI) is published,
		// /releases/latest stops pointing to the desktop release and the .dmg 404s.
		// The URL must use a dedicated desktop-stable tag instead.
		expect(DOWNLOAD_URL_MAC_ARM64).not.toContain("/releases/latest/");
	});

	test("should use the desktop-stable rolling tag for reliable desktop downloads", () => {
		expect(DOWNLOAD_URL_MAC_ARM64).toBe(
			`${COMPANY.GITHUB_URL}/releases/download/desktop-stable/Superset-arm64.dmg`,
		);
	});

	test("should point to the correct GitHub repository", () => {
		expect(DOWNLOAD_URL_MAC_ARM64).toContain("github.com/superset-sh/superset");
	});

	test("should download the ARM64 DMG file", () => {
		expect(DOWNLOAD_URL_MAC_ARM64).toMatch(/Superset-arm64\.dmg$/);
	});
});
