/**
 * @file Regression test for https://github.com/anthropics/superset/issues/3482
 *
 * When opening a new Claude (chat) tab, the pane must fill the available width
 * immediately. The bug was caused by the TabView root container using `w-full`
 * (percentage-based `width: 100%`) inside a flex-row parent. In certain
 * rendering conditions the percentage didn't resolve on the first paint,
 * leaving the pane narrower than the viewport until a sibling resize forced a
 * layout recalculation.
 *
 * The fix replaces `w-full` with `flex-1 min-w-0` so the element participates
 * directly in the flex algorithm rather than relying on percentage resolution.
 *
 * These tests read the source files and verify the CSS class contracts that
 * ensure the layout chain propagates width correctly from the flex-row parent
 * down to the mosaic container.
 */

import { describe, expect, test } from "bun:test";

function readSource(relativePath: string): string {
	const fullPath = `${import.meta.dir}/${relativePath}`;
	const proc = Bun.spawnSync(["cat", fullPath]);
	return proc.stdout.toString();
}

describe("TabView layout classes (issue #3482)", () => {
	test("TabView root uses flex-1 min-w-0 instead of w-full for robust flex sizing", () => {
		const source = readSource("index.tsx");

		// The mosaic-container div must use flex-1 to grow within the flex-row
		// parent (TabsContent) rather than relying on percentage-based w-full.
		expect(source).toContain("flex-1 min-w-0 h-full mosaic-container");

		// It must NOT use w-full, which can fail to resolve on initial render
		// when the parent's width is determined by the flex algorithm.
		expect(source).not.toMatch(
			/className="[^"]*\bw-full\b[^"]*mosaic-container/,
		);
	});

	test("TabsContent is a flex-row container so children must use flex-1", () => {
		const source = readSource("../index.tsx"); // TabsContent/index.tsx

		// TabsContent must be a flex row so that TabView (its child) can use
		// flex-1 to fill the available width.
		expect(source).toMatch(/className="[^"]*\bflex\b[^"]*"/);
		expect(source).toMatch(/className="[^"]*\bflex-1\b[^"]*"/);
	});
});
