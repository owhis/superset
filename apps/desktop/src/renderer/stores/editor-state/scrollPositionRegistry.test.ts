import { beforeEach, describe, expect, test } from "bun:test";
import {
	deleteScrollPosition,
	getScrollPosition,
	hasScrollPosition,
	saveScrollPosition,
	transferScrollPosition,
} from "./scrollPositionRegistry";

/**
 * Reproduction & fix test for GitHub issue #2848:
 * Scroll position resets to top when switching workspaces or tabs.
 *
 * Root cause: TabsContent only renders the active tab, completely unmounting
 * inactive tabs from the DOM. When a tab unmounts, CodeMirror's EditorView is
 * destroyed and scroll containers are removed — losing all scroll state.
 * No scroll position persistence mechanism existed.
 *
 * Fix: Introduce a scrollPositionRegistry (plain Map<string, ScrollPosition>
 * outside React state, keyed by documentKey) that saves scroll position on
 * unmount and restores it on mount.
 */

const DOC_KEY_A = "workspace-1::working::src%2Findex.ts";
const DOC_KEY_B = "workspace-2::working::src%2Fapp.tsx";

beforeEach(() => {
	deleteScrollPosition(DOC_KEY_A);
	deleteScrollPosition(DOC_KEY_B);
});

describe("scrollPositionRegistry", () => {
	test("returns undefined for unknown document key", () => {
		expect(getScrollPosition("unknown-key")).toBeUndefined();
		expect(hasScrollPosition("unknown-key")).toBe(false);
	});

	test("saves and retrieves scroll position", () => {
		saveScrollPosition(DOC_KEY_A, 350, 0);

		const position = getScrollPosition(DOC_KEY_A);
		expect(position).toEqual({ scrollTop: 350, scrollLeft: 0 });
		expect(hasScrollPosition(DOC_KEY_A)).toBe(true);
	});

	test("overwrites previous scroll position for same key", () => {
		saveScrollPosition(DOC_KEY_A, 100, 0);
		saveScrollPosition(DOC_KEY_A, 500, 20);

		const position = getScrollPosition(DOC_KEY_A);
		expect(position).toEqual({ scrollTop: 500, scrollLeft: 20 });
	});

	test("deletes scroll position", () => {
		saveScrollPosition(DOC_KEY_A, 200, 0);
		deleteScrollPosition(DOC_KEY_A);

		expect(getScrollPosition(DOC_KEY_A)).toBeUndefined();
		expect(hasScrollPosition(DOC_KEY_A)).toBe(false);
	});

	test("deleting non-existent key does not throw", () => {
		expect(() => deleteScrollPosition("nonexistent")).not.toThrow();
	});

	test("tracks multiple documents independently", () => {
		saveScrollPosition(DOC_KEY_A, 100, 0);
		saveScrollPosition(DOC_KEY_B, 999, 50);

		expect(getScrollPosition(DOC_KEY_A)).toEqual({
			scrollTop: 100,
			scrollLeft: 0,
		});
		expect(getScrollPosition(DOC_KEY_B)).toEqual({
			scrollTop: 999,
			scrollLeft: 50,
		});
	});

	test("transferScrollPosition moves position to new key", () => {
		saveScrollPosition(DOC_KEY_A, 400, 10);
		transferScrollPosition(DOC_KEY_A, DOC_KEY_B);

		expect(getScrollPosition(DOC_KEY_A)).toBeUndefined();
		expect(getScrollPosition(DOC_KEY_B)).toEqual({
			scrollTop: 400,
			scrollLeft: 10,
		});
	});

	test("transferScrollPosition is no-op when keys are the same", () => {
		saveScrollPosition(DOC_KEY_A, 123, 0);
		transferScrollPosition(DOC_KEY_A, DOC_KEY_A);

		expect(getScrollPosition(DOC_KEY_A)).toEqual({
			scrollTop: 123,
			scrollLeft: 0,
		});
	});

	test("transferScrollPosition is no-op when source has no position", () => {
		transferScrollPosition(DOC_KEY_A, DOC_KEY_B);
		expect(getScrollPosition(DOC_KEY_B)).toBeUndefined();
	});

	describe("simulates tab/workspace switch scenario (issue #2848)", () => {
		test("scroll position survives unmount/remount cycle", () => {
			// 1. User scrolls down in workspace A
			saveScrollPosition(DOC_KEY_A, 750, 0);

			// 2. User switches to workspace B (component A unmounts — position saved)
			// 3. User switches back to workspace A (component A remounts)
			const restored = getScrollPosition(DOC_KEY_A);

			// 4. Scroll position should be available for restoration
			expect(restored).toEqual({ scrollTop: 750, scrollLeft: 0 });
		});

		test("scroll position survives tab switch within same workspace", () => {
			// Tab 1 file scroll position saved on unmount
			saveScrollPosition(DOC_KEY_A, 300, 0);
			// Tab 2 file scroll position saved on unmount
			saveScrollPosition(DOC_KEY_B, 600, 0);

			// Switch back to Tab 1 — position available
			expect(getScrollPosition(DOC_KEY_A)).toEqual({
				scrollTop: 300,
				scrollLeft: 0,
			});
			// Switch back to Tab 2 — position available
			expect(getScrollPosition(DOC_KEY_B)).toEqual({
				scrollTop: 600,
				scrollLeft: 0,
			});
		});
	});
});
