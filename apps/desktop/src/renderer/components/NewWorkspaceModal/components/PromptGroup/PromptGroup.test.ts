import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs path for source verification
import { join } from "node:path";

const source = readFileSync(join(__dirname, "PromptGroup.tsx"), "utf-8");

describe("NewWorkspaceModal PromptGroup — Cmd+Enter shortcut (#2788)", () => {
	test("attaches onKeyDown to the parent fieldset so Cmd+Enter works from any focused field", () => {
		// The handler must be on the wrapping <fieldset>, not only on the PromptInputTextarea.
		// This ensures Cmd+Enter fires when workspace-name or branch-name
		// inputs have focus (keyboard events bubble up from children).
		expect(source).toContain("<fieldset");
		expect(source).toContain("onKeyDown={handleKeyDown}");
	});

	test("does NOT have a duplicate onKeyDown on the PromptInputTextarea", () => {
		// The textarea should no longer carry its own onKeyDown — the parent
		// container handles Cmd+Enter for all children via event bubbling.
		// Look for <PromptInputTextarea ... onKeyDown in JSX (not imports).
		const jsxTextareaOnKeyDown = source.match(
			/<PromptInputTextarea[\s\S]*?onKeyDown/g,
		);
		expect(jsxTextareaOnKeyDown).toBeNull();
	});

	test("handleKeyDown calls handleCreate on Cmd+Enter", () => {
		expect(source).toContain('e.key === "Enter" && (e.metaKey || e.ctrlKey)');
		expect(source).toContain("void handleCreate()");
	});
});
