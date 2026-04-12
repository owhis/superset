import { describe, expect, test } from "bun:test";
import { isTerminalReservedEvent } from "./utils";

function makeKeyboardEvent(
	overrides: Partial<KeyboardEvent> & { code: string; key: string },
): KeyboardEvent {
	return {
		type: "keydown",
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	} as unknown as KeyboardEvent;
}

describe("isTerminalReservedEvent", () => {
	test("recognises Ctrl+C with Latin input", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyC", key: "c", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+D with Latin input", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyD", key: "d", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+Z with Latin input", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyZ", key: "z", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+S with Latin input", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyS", key: "s", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+Q with Latin input", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyQ", key: "q", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+Backslash with Latin input", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({
					code: "Backslash",
					key: "\\",
					ctrlKey: true,
				}),
			),
		).toBe(true);
	});

	// Reproduction for #3365: Korean IME transforms event.key to Hangul
	test("recognises Ctrl+D under Korean IME (event.key = ㅇ)", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyD", key: "ㅇ", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+C under Korean IME (event.key = ㅊ)", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyC", key: "ㅊ", ctrlKey: true }),
			),
		).toBe(true);
	});

	test("recognises Ctrl+Z under Korean IME (event.key = ㅋ)", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyZ", key: "ㅋ", ctrlKey: true }),
			),
		).toBe(true);
	});

	// Non-reserved chords should not match
	test("rejects Ctrl+A (not reserved)", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyA", key: "a", ctrlKey: true }),
			),
		).toBe(false);
	});

	// Modifier combinations that should not match
	test("rejects Ctrl+Meta+C", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({
					code: "KeyC",
					key: "c",
					ctrlKey: true,
					metaKey: true,
				}),
			),
		).toBe(false);
	});

	test("rejects C without Ctrl", () => {
		expect(
			isTerminalReservedEvent(
				makeKeyboardEvent({ code: "KeyC", key: "c", ctrlKey: false }),
			),
		).toBe(false);
	});
});
