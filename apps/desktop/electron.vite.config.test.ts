import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vite's dependency pre-bundling can split @codemirror/state into separate
 * chunks. Because CodeMirror validates extensions with `instanceof`, two copies
 * of the same class cause a runtime crash:
 *
 *   "Unrecognized extension value in extension set ([object Object])"
 *
 * The renderer config must include `resolve.dedupe` for all CodeMirror / Lezer
 * packages whose classes are compared by identity.
 *
 * See: https://github.com/nicepkg/superset/issues/3259
 */
describe("electron.vite.config - CodeMirror dedupe", () => {
	const configSource = readFileSync(
		resolve(__dirname, "electron.vite.config.ts"),
		"utf-8",
	);

	const requiredDedupePackages = [
		"@codemirror/state",
		"@codemirror/view",
		"@codemirror/language",
		"@lezer/common",
		"@lezer/highlight",
	];

	test("renderer config includes resolve.dedupe for CodeMirror packages", () => {
		// Extract the renderer section (from `renderer:` to end of config)
		// Extract everything after `renderer:` in the config
		const rendererIdx = configSource.indexOf("renderer:");
		expect(rendererIdx).toBeGreaterThan(-1);

		const rendererSection = configSource.slice(rendererIdx);

		// Verify resolve.dedupe block exists in the renderer section
		expect(rendererSection).toContain("resolve:");
		expect(rendererSection).toContain("dedupe:");

		// Verify each required package is present in dedupe
		for (const pkg of requiredDedupePackages) {
			expect(rendererSection).toContain(`"${pkg}"`);
		}
	});

	test("resolve.dedupe is NOT in the main config (only renderer needs it)", () => {
		// The main process doesn't bundle CodeMirror - dedupe belongs in renderer only.
		// Extract main section up to preload
		const mainMatch = configSource.match(/main:\s*\{([\s\S]*?)\n\tpreload:/);
		expect(mainMatch).not.toBeNull();
		const mainSection = mainMatch?.[1];

		expect(mainSection).not.toContain("dedupe:");
	});
});
