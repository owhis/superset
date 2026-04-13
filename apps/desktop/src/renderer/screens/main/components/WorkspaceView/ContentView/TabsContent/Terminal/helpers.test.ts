import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { setupKeyboardHandler } from "./helpers";

// Capture the handler passed to attachCustomKeyEventHandler so we can
// invoke it directly with synthetic KeyboardEvent stubs.
function makeXterm(): {
	xterm: XTerm;
	getHandler: () => (event: KeyboardEvent) => boolean;
} {
	let handler: ((event: KeyboardEvent) => boolean) | null = null;

	const xterm = {
		attachCustomKeyEventHandler: (h: (event: KeyboardEvent) => boolean) => {
			handler = h;
		},
	} as unknown as XTerm;

	return {
		xterm,
		getHandler: () => {
			if (!handler) throw new Error("Handler not attached");
			return handler;
		},
	};
}

function keyEvent(
	overrides: Partial<KeyboardEvent> & { key: string },
): KeyboardEvent {
	return {
		type: "keydown",
		key: overrides.key,
		code: "",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		preventDefault: mock(() => {}),
		stopImmediatePropagation: mock(() => {}),
		...overrides,
	} as unknown as KeyboardEvent;
}

// The handler reads navigator.platform at setup time. We need to control it
// for platform-specific tests.
const originalNavigator = globalThis.navigator;

function setPlatform(platform: string): void {
	Object.defineProperty(globalThis, "navigator", {
		value: { ...originalNavigator, platform },
		writable: true,
		configurable: true,
	});
}

function restorePlatform(): void {
	Object.defineProperty(globalThis, "navigator", {
		value: originalNavigator,
		writable: true,
		configurable: true,
	});
}

describe("setupKeyboardHandler", () => {
	describe("paste shortcut (Cmd+V / Ctrl+V)", () => {
		describe("macOS", () => {
			beforeEach(() => setPlatform("MacIntel"));
			afterEach(restorePlatform);

			it("returns false for Cmd+V so the browser handles paste", () => {
				const { xterm, getHandler } = makeXterm();
				setupKeyboardHandler(xterm);
				const handler = getHandler();

				const event = keyEvent({ key: "v", metaKey: true });
				expect(handler(event)).toBe(false);
			});

			it("does NOT intercept Cmd+Shift+V", () => {
				const { xterm, getHandler } = makeXterm();
				setupKeyboardHandler(xterm);
				const handler = getHandler();

				const event = keyEvent({ key: "v", metaKey: true, shiftKey: true });
				// Should return true (let xterm handle it) since it's not a plain paste
				expect(handler(event)).toBe(true);
			});

			it("does NOT intercept Ctrl+V on Mac (Ctrl+V sends ^V to terminal)", () => {
				const { xterm, getHandler } = makeXterm();
				setupKeyboardHandler(xterm);
				const handler = getHandler();

				const event = keyEvent({ key: "v", ctrlKey: true });
				// Ctrl+V on Mac is not a paste shortcut — it sends ^V (0x16) to the PTY.
				// The handler should return true so xterm processes it normally.
				expect(handler(event)).toBe(true);
			});
		});

		describe("Windows/Linux", () => {
			beforeEach(() => setPlatform("Win32"));
			afterEach(restorePlatform);

			it("returns false for Ctrl+V so the browser handles paste", () => {
				const { xterm, getHandler } = makeXterm();
				setupKeyboardHandler(xterm);
				const handler = getHandler();

				const event = keyEvent({ key: "v", ctrlKey: true });
				expect(handler(event)).toBe(false);
			});

			it("does NOT intercept Ctrl+Shift+V", () => {
				const { xterm, getHandler } = makeXterm();
				setupKeyboardHandler(xterm);
				const handler = getHandler();

				const event = keyEvent({
					key: "v",
					ctrlKey: true,
					shiftKey: true,
				});
				expect(handler(event)).toBe(true);
			});
		});

		describe("Linux", () => {
			beforeEach(() => setPlatform("Linux x86_64"));
			afterEach(restorePlatform);

			it("returns false for Ctrl+V so the browser handles paste", () => {
				const { xterm, getHandler } = makeXterm();
				setupKeyboardHandler(xterm);
				const handler = getHandler();

				const event = keyEvent({ key: "v", ctrlKey: true });
				expect(handler(event)).toBe(false);
			});
		});
	});

	describe("other shortcuts still work", () => {
		beforeEach(() => setPlatform("MacIntel"));
		afterEach(restorePlatform);

		it("returns false for Shift+Enter", () => {
			const onShiftEnter = mock(() => {});
			const { xterm, getHandler } = makeXterm();
			setupKeyboardHandler(xterm, { onShiftEnter });
			const handler = getHandler();

			const event = keyEvent({ key: "Enter", shiftKey: true });
			expect(handler(event)).toBe(false);
		});

		it("returns true for regular keys (they go to PTY)", () => {
			const { xterm, getHandler } = makeXterm();
			setupKeyboardHandler(xterm);
			const handler = getHandler();

			const event = keyEvent({ key: "a" });
			expect(handler(event)).toBe(true);
		});
	});
});
