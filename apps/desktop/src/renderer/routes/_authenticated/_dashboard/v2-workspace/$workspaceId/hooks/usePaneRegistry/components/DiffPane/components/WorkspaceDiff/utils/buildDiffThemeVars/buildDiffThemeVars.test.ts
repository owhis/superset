import { describe, expect, test } from "bun:test";
import type { Theme } from "shared/themes";
import { darkTheme } from "shared/themes/built-in/ember";
import { lightTheme } from "shared/themes/built-in/light";
import { buildDiffThemeVars } from "./buildDiffThemeVars";

function withCustomDiffColors(
	theme: Theme,
	overrides: { addition: string; deletion: string; modified: string },
): Theme {
	return {
		...theme,
		editor: {
			...theme.editor,
			colors: {
				...theme.editor?.colors,
				addition: overrides.addition,
				deletion: overrides.deletion,
				modified: overrides.modified,
			},
		},
	};
}

describe("buildDiffThemeVars", () => {
	test("dark theme's custom editor.colors.{addition,deletion,modified} flow through to diff vars", () => {
		const customAddition = "#00aaff";
		const customDeletion = "#ff00cc";
		const customModified = "#f0c000";
		const theme = withCustomDiffColors(darkTheme, {
			addition: customAddition,
			deletion: customDeletion,
			modified: customModified,
		});

		const vars = buildDiffThemeVars(theme, {}) as Record<string, string>;

		expect(vars["--diffs-addition-color-override"]).toBe(customAddition);
		expect(vars["--diffs-deletion-color-override"]).toBe(customDeletion);
		expect(vars["--diffs-modified-color-override"]).toBe(customModified);
	});

	test("light theme's custom editor.colors.{addition,deletion,modified} flow through to diff vars", () => {
		const customAddition = "#008800";
		const customDeletion = "#aa0022";
		const customModified = "#b58900";
		const theme = withCustomDiffColors(lightTheme, {
			addition: customAddition,
			deletion: customDeletion,
			modified: customModified,
		});

		const vars = buildDiffThemeVars(theme, {}) as Record<string, string>;

		expect(vars["--diffs-addition-color-override"]).toBe(customAddition);
		expect(vars["--diffs-deletion-color-override"]).toBe(customDeletion);
		expect(vars["--diffs-modified-color-override"]).toBe(customModified);
	});
});
