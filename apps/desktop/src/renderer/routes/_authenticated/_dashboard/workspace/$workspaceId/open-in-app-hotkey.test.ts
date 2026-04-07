import { describe, expect, test } from "bun:test";

/**
 * Regression test for https://github.com/nicepkg/superset/issues/3228
 *
 * Bug: pressing the OPEN_IN_APP keyboard shortcut (⌘O / Ctrl+Shift+O) opened
 * an "untitled workspace" in the IDE instead of the correct workspace.
 *
 * Root cause: OPEN_IN_APP was registered via useHotkey in BOTH the
 * WorkspacePage component AND the TopBar's OpenInMenuButton. When the user
 * pressed the shortcut, react-hotkeys-hook fired both handlers, sending two
 * rapid `openInApp` mutations. The second near-simultaneous `open -a <IDE>`
 * call caused the IDE to open an additional untitled window.
 *
 * Fix: removed the duplicate useHotkey("OPEN_IN_APP", …) from WorkspacePage.
 * The TopBar's OpenInMenuButton is the single owner of this hotkey binding.
 */

// biome-ignore lint/style/noRestrictedImports: test file reads source on disk
const { readFileSync } = await import("node:fs");
// biome-ignore lint/style/noRestrictedImports: test file reads source on disk
const { join } = await import("node:path");

const PAGE_PATH = join(import.meta.dirname, "page.tsx");

describe("OPEN_IN_APP hotkey (issue #3228)", () => {
	test("WorkspacePage must NOT register the OPEN_IN_APP hotkey (owned by TopBar's OpenInMenuButton)", () => {
		const source = readFileSync(PAGE_PATH, "utf-8");

		// The page should not contain an active useHotkey("OPEN_IN_APP") call.
		// It may reference the id in comments or as a display-only helper, so we
		// specifically look for the useHotkey call pattern.
		const hotkeyCallPattern = /useHotkey\(\s*["']OPEN_IN_APP["']/;
		expect(source).not.toMatch(hotkeyCallPattern);
	});

	test("OpenInMenuButton registers the OPEN_IN_APP hotkey", () => {
		const buttonPath = join(
			import.meta.dirname,
			"../../components/TopBar/components/OpenInMenuButton/OpenInMenuButton.tsx",
		);
		const source = readFileSync(buttonPath, "utf-8");

		const hotkeyCallPattern = /useHotkey\(\s*["']OPEN_IN_APP["']/;
		expect(source).toMatch(hotkeyCallPattern);
	});

	test("V2OpenInMenuButton registers the OPEN_IN_APP hotkey", () => {
		const buttonPath = join(
			import.meta.dirname,
			"../../components/TopBar/components/V2OpenInMenuButton/V2OpenInMenuButton.tsx",
		);
		const source = readFileSync(buttonPath, "utf-8");

		const hotkeyCallPattern = /useHotkey\(\s*["']OPEN_IN_APP["']/;
		expect(source).toMatch(hotkeyCallPattern);
	});
});
