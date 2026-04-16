import { describe, expect, it } from "bun:test";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	resolveTerminalFontFamily,
} from "./index";

describe("resolveTerminalFontFamily", () => {
	it("returns the default monospace chain when no user font is set", () => {
		expect(resolveTerminalFontFamily(null)).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
		expect(resolveTerminalFontFamily(undefined)).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(resolveTerminalFontFamily("")).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
		expect(resolveTerminalFontFamily("   ")).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
	});

	it("places the user-chosen font first so it is preferred when available", () => {
		const result = resolveTerminalFontFamily("JetBrains Mono");
		expect(result.startsWith('"JetBrains Mono"')).toBe(true);
	});

	/**
	 * Regression test for issue #3513: setting the terminal font to a
	 * non-monospace family (e.g. "Inter") caused xterm to render with broken
	 * metrics and the app to crash into a blank window on relaunch, with no
	 * in-app recovery path. Guarantee that a generic `monospace` fallback is
	 * always present so the terminal can survive a bad user choice.
	 */
	it("always appends `monospace` as a final fallback for non-monospace user fonts", () => {
		const result = resolveTerminalFontFamily("Inter");
		expect(result).toContain('"Inter"');
		expect(result.endsWith("monospace")).toBe(true);
	});

	it("does not duplicate the user's font if it already matches a default", () => {
		const result = resolveTerminalFontFamily("JetBrains Mono");
		const occurrences = result.match(/"JetBrains Mono"/g) ?? [];
		expect(occurrences).toHaveLength(1);
	});

	it("trims surrounding whitespace from the user font", () => {
		const result = resolveTerminalFontFamily("  Inter  ");
		expect(result).toContain('"Inter"');
		expect(result).not.toContain('"  Inter  "');
	});
});
