import { describe, expect, test } from "bun:test";
import { isTerminalReservedEvent } from "./utils";

/** Helper to create a minimal KeyboardEvent-like object. */
function makeKeyEvent(
	key: string,
	modifiers: {
		ctrl?: boolean;
		meta?: boolean;
		alt?: boolean;
		shift?: boolean;
	} = {},
): KeyboardEvent {
	return {
		key,
		ctrlKey: modifiers.ctrl ?? false,
		metaKey: modifiers.meta ?? false,
		altKey: modifiers.alt ?? false,
		shiftKey: modifiers.shift ?? false,
	} as unknown as KeyboardEvent;
}

describe("isTerminalReservedEvent", () => {
	test("original reserved shortcuts are recognised", () => {
		for (const key of ["c", "d", "z", "s", "q", "\\"]) {
			expect(isTerminalReservedEvent(makeKeyEvent(key, { ctrl: true }))).toBe(
				true,
			);
		}
	});

	test("readline shortcuts are recognised as terminal-reserved", () => {
		const readlineKeys = [
			"r", // reverse history search
			"l", // clear screen
			"a", // beginning of line
			"e", // end of line
			"w", // delete word backward
			"k", // kill to end of line
			"u", // clear line before cursor
			"p", // previous history
			"n", // next history
			"b", // move cursor back
			"f", // move cursor forward
			"y", // yank (paste killed text)
		];

		for (const key of readlineKeys) {
			expect(isTerminalReservedEvent(makeKeyEvent(key, { ctrl: true }))).toBe(
				true,
			);
		}
	});

	test("non-reserved ctrl combos are not matched", () => {
		// ctrl+t (new tab in most apps) is NOT a readline shortcut we reserve
		expect(isTerminalReservedEvent(makeKeyEvent("t", { ctrl: true }))).toBe(
			false,
		);
	});

	test("meta-only combos are not matched", () => {
		expect(isTerminalReservedEvent(makeKeyEvent("r", { meta: true }))).toBe(
			false,
		);
	});

	test("ctrl+shift combos are not matched", () => {
		expect(
			isTerminalReservedEvent(makeKeyEvent("r", { ctrl: true, shift: true })),
		).toBe(false);
	});

	test("ctrl+alt combos are not matched", () => {
		expect(
			isTerminalReservedEvent(makeKeyEvent("r", { ctrl: true, alt: true })),
		).toBe(false);
	});
});
