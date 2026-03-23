import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs path for source verification
import { join } from "node:path";

const source = readFileSync(join(__dirname, "PromptGroup.tsx"), "utf-8");

describe("PromptGroup — Cmd+Enter shortcut (#2788)", () => {
	test("attaches onKeyDown to the parent fieldset so Cmd+Enter works from any focused field", () => {
		// The handler must be on the wrapping <fieldset>, not only on the <Textarea>.
		// This ensures Cmd+Enter fires even when the branch-name input has focus
		// (keyboard events bubble up from children).
		expect(source).toContain("<fieldset");
		expect(source).toContain("onKeyDown={handleKeyDown}");
	});

	test("does NOT have a duplicate onKeyDown on the Textarea", () => {
		// The Textarea should no longer carry its own onKeyDown — the parent
		// container handles Cmd+Enter for all children via event bubbling.
		// Look for <Textarea ... onKeyDown in JSX (not imports).
		const jsxTextareaOnKeyDown = source.match(/<Textarea[\s\S]*?onKeyDown/g);
		expect(jsxTextareaOnKeyDown).toBeNull();
	});

	test("handleKeyDown calls handleCreate on Cmd+Enter", () => {
		// Verify the handler checks for metaKey (Cmd on macOS) and ctrlKey (Ctrl on Windows/Linux)
		expect(source).toContain('e.key === "Enter" && (e.metaKey || e.ctrlKey)');
		expect(source).toContain("handleCreate()");
	});
});
