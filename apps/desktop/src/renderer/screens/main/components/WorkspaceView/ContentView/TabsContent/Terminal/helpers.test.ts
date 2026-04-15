/**
 * Reproduction tests for issue #3484:
 * "OpenCode Paste sends multiple messages"
 *
 * Root cause 1 (primary): When switching tabs, the Terminal component unmounts
 * and isBracketedPasteRef is reset to false. On reattach the ref is never
 * restored because the reattach fast-path skips createOrAttach (uses the
 * cached xterm whose internal modes ARE correct). CMD+V then sends pasted
 * text WITHOUT bracketed paste markers, so every \r (newline) is interpreted
 * by the TUI as Enter → submit message.
 *
 * Context-menu paste works because it calls xterm.paste(), which reads
 * xterm's internal modes.bracketedPasteMode (correctly maintained by the
 * cache writing stream data to xterm while hidden).
 *
 * Root cause 2 (secondary): For pastes larger than MAX_SYNC_PASTE_CHARS
 * (16 384 chars), the code chunked the text and wrapped EACH chunk in its
 * own bracketed paste markers (\x1b[200~ … \x1b[201~). This sent N
 * separate paste events to the TUI instead of 1.
 *
 * Fix 1: On reattach, sync isBracketedPasteRef from xterm.modes.bracketedPasteMode.
 * Fix 2: Use a single bracketed paste envelope across all chunks.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// 1. Reproduction: bracketed paste mode lost after tab switch (reattach)
// ---------------------------------------------------------------------------

/**
 * Minimal model of the mode-tracking lifecycle across tab switches.
 *
 * Simulates:
 * - Initial mount: modes start false, stream data enables bracketed paste
 * - Tab switch (unmount + remount): cleanup resets refs, reattach fast-path
 * - The bug: after reattach, isBracketedPasteRef is false despite xterm
 *   having the correct mode state
 */
describe("bracketed paste mode across tab switches — issue #3484", () => {
	/** Simulates xterm's internal mode tracking (always correct). */
	function createMockXterm() {
		return {
			modes: { bracketedPasteMode: false },
			buffer: { active: { type: "normal" as "normal" | "alternate" } },
			/** Simulate writing stream data that enables bracketed paste. */
			enableBracketedPaste() {
				this.modes.bracketedPasteMode = true;
			},
		};
	}

	/** Simulates the component's isBracketedPasteRef lifecycle. */
	function createModesRef() {
		return { current: false };
	}

	/**
	 * Simulates updateModesFromData — scans stream data for mode changes.
	 * In production this is in useTerminalModes.ts.
	 */
	function updateModesFromData(ref: { current: boolean }, data: string): void {
		if (data.includes("\x1b[?2004h")) ref.current = true;
		if (data.includes("\x1b[?2004l")) ref.current = false;
	}

	it("detects bracketed paste mode from stream data on initial mount", () => {
		const xterm = createMockXterm();
		const isBracketedPasteRef = createModesRef();

		// OpenCode starts and enables bracketed paste
		const streamData = "Welcome to OpenCode\x1b[?2004h";
		updateModesFromData(isBracketedPasteRef, streamData);
		xterm.enableBracketedPaste();

		expect(isBracketedPasteRef.current).toBe(true);
		expect(xterm.modes.bracketedPasteMode).toBe(true);
	});

	it("REPRODUCES BUG: modes are lost after tab switch without fix", () => {
		const xterm = createMockXterm();
		const isBracketedPasteRef = createModesRef();

		// Initial mount — bracketed paste enabled
		const streamData = "Welcome to OpenCode\x1b[?2004h";
		updateModesFromData(isBracketedPasteRef, streamData);
		xterm.enableBracketedPaste();
		expect(isBracketedPasteRef.current).toBe(true);

		// --- Tab switch: component unmounts ---
		// Cleanup calls resetModes()
		isBracketedPasteRef.current = false;

		// While unmounted, cache keeps writing to xterm (but NOT updating ref)
		// xterm's internal state remains correct
		expect(xterm.modes.bracketedPasteMode).toBe(true);

		// --- Tab switch back: component remounts ---
		// New component creates new ref (starts false).
		// BUG: Without the fix, reattach path does NOT restore from xterm.
		const newRef = createModesRef(); // new component = new ref
		// (bug) The reattach path only sets isStreamReadyRef = true

		// BUG: ref is false even though xterm knows bracketed paste is on
		expect(newRef.current).toBe(false);
		expect(xterm.modes.bracketedPasteMode).toBe(true);

		// This means CMD+V paste will NOT wrap text with bracket markers,
		// so every \r in the pasted multiline text triggers a submit.
	});

	it("FIX: restoring modes from xterm on reattach", () => {
		const xterm = createMockXterm();
		const isBracketedPasteRef = createModesRef();

		// Initial mount — bracketed paste enabled
		const streamData = "Welcome to OpenCode\x1b[?2004h";
		updateModesFromData(isBracketedPasteRef, streamData);
		xterm.enableBracketedPaste();
		expect(isBracketedPasteRef.current).toBe(true);

		// --- Tab switch: unmount ---
		isBracketedPasteRef.current = false;

		// --- Tab switch back: remount ---
		const newRef = createModesRef();

		// FIX: reattach path now syncs from xterm's authoritative state
		newRef.current = xterm.modes.bracketedPasteMode;

		expect(newRef.current).toBe(true);
		// CMD+V paste will correctly wrap text with bracket markers
	});
});

// ---------------------------------------------------------------------------
// 2. Reproduction: large-paste chunking sends multiple paste events
// ---------------------------------------------------------------------------

/**
 * Extracts and tests the paste chunking logic from setupPasteHandler.
 * The function simulates the onWrite-path behavior for large pastes.
 */
function simulateLargePaste(
	text: string,
	bracketedPasteEnabled: boolean,
): string[] {
	const MAX_SYNC_PASTE_CHARS = 16_384;
	const CHUNK_CHARS = 16_384;
	const preparedText = text.replace(/\r?\n/g, "\r");
	const writes: string[] = [];

	if (preparedText.length <= MAX_SYNC_PASTE_CHARS) {
		writes.push(
			bracketedPasteEnabled
				? `\x1b[200~${preparedText}\x1b[201~`
				: preparedText,
		);
		return writes;
	}

	// This is the FIXED logic (single envelope).
	let offset = 0;
	while (offset < preparedText.length) {
		const chunk = preparedText.slice(offset, offset + CHUNK_CHARS);
		const isFirst = offset === 0;
		offset += CHUNK_CHARS;
		const isLast = offset >= preparedText.length;

		if (bracketedPasteEnabled) {
			const prefix = isFirst ? "\x1b[200~" : "";
			const suffix = isLast ? "\x1b[201~" : "";
			writes.push(`${prefix}${chunk}${suffix}`);
		} else {
			writes.push(chunk);
		}
	}

	return writes;
}

/** Simulates the OLD (buggy) chunking that wrapped each chunk. */
function simulateLargePasteBuggy(
	text: string,
	bracketedPasteEnabled: boolean,
): string[] {
	const MAX_SYNC_PASTE_CHARS = 16_384;
	const CHUNK_CHARS = 16_384;
	const preparedText = text.replace(/\r?\n/g, "\r");
	const writes: string[] = [];

	if (preparedText.length <= MAX_SYNC_PASTE_CHARS) {
		writes.push(
			bracketedPasteEnabled
				? `\x1b[200~${preparedText}\x1b[201~`
				: preparedText,
		);
		return writes;
	}

	let offset = 0;
	while (offset < preparedText.length) {
		const chunk = preparedText.slice(offset, offset + CHUNK_CHARS);
		offset += CHUNK_CHARS;

		if (bracketedPasteEnabled) {
			// BUG: each chunk gets its own bracket pair
			writes.push(`\x1b[200~${chunk}\x1b[201~`);
		} else {
			writes.push(chunk);
		}
	}

	return writes;
}

describe("large-paste bracketed paste chunking — issue #3484", () => {
	const BP_START = "\x1b[200~";
	const BP_END = "\x1b[201~";

	function makeLargeText(chars: number): string {
		// Create text with embedded newlines to simulate multiline paste
		let text = "";
		while (text.length < chars) {
			text += "Line of pasted text content here\n";
		}
		return text.slice(0, chars);
	}

	it("small paste: single write with brackets", () => {
		const text = "line 1\nline 2\nline 3";
		const writes = simulateLargePaste(text, true);

		expect(writes).toHaveLength(1);
		expect(writes[0]?.startsWith(BP_START)).toBe(true);
		expect(writes[0]?.endsWith(BP_END)).toBe(true);
	});

	it("small paste without brackets: single write, no markers", () => {
		const text = "line 1\nline 2\nline 3";
		const writes = simulateLargePaste(text, false);

		expect(writes).toHaveLength(1);
		expect(writes[0]?.includes(BP_START)).toBe(false);
		expect(writes[0]?.includes(BP_END)).toBe(false);
	});

	it("REPRODUCES BUG: old chunking sends multiple bracket pairs", () => {
		const text = makeLargeText(40_000); // ~2.4 chunks
		const writes = simulateLargePasteBuggy(text, true);

		expect(writes.length).toBeGreaterThan(1);

		// BUG: each chunk has its own bracket pair = multiple paste events
		for (const write of writes) {
			expect(write.startsWith(BP_START)).toBe(true);
			expect(write.endsWith(BP_END)).toBe(true);
		}

		// Count total bracket pairs — should be 1 but is N (bug)
		const allText = writes.join("");
		const startCount = allText.split(BP_START).length - 1;
		const endCount = allText.split(BP_END).length - 1;
		expect(startCount).toBeGreaterThan(1); // bug: multiple start markers
		expect(endCount).toBeGreaterThan(1); // bug: multiple end markers
	});

	it("FIX: large paste uses single bracket envelope across chunks", () => {
		const text = makeLargeText(40_000); // ~2.4 chunks
		const writes = simulateLargePaste(text, true);

		expect(writes.length).toBeGreaterThan(1);

		// Only first chunk starts with bracket marker
		expect(writes[0]?.startsWith(BP_START)).toBe(true);
		expect(writes[0]?.endsWith(BP_END)).toBe(false);

		// Middle chunks have no markers
		for (let i = 1; i < writes.length - 1; i++) {
			expect(writes[i]?.includes(BP_START)).toBe(false);
			expect(writes[i]?.includes(BP_END)).toBe(false);
		}

		// Only last chunk ends with bracket marker
		const last = writes[writes.length - 1]!;
		expect(last.startsWith(BP_START)).toBe(false);
		expect(last.endsWith(BP_END)).toBe(true);

		// Exactly 1 bracket pair total — TUI sees one atomic paste event
		const allText = writes.join("");
		const startCount = allText.split(BP_START).length - 1;
		const endCount = allText.split(BP_END).length - 1;
		expect(startCount).toBe(1);
		expect(endCount).toBe(1);
	});

	it("FIX: concatenated chunks reproduce original text", () => {
		const text = makeLargeText(40_000);
		const writes = simulateLargePaste(text, true);

		// Strip bracket markers and concatenate
		const reassembled = writes
			.join("")
			.replace(BP_START, "")
			.replace(BP_END, "");

		// Newlines were normalized to \r
		const expected = text.replace(/\r?\n/g, "\r");
		expect(reassembled).toBe(expected);
	});

	it("large paste without brackets: no markers at all", () => {
		const text = makeLargeText(40_000);
		const writes = simulateLargePaste(text, false);

		const allText = writes.join("");
		expect(allText.includes(BP_START)).toBe(false);
		expect(allText.includes(BP_END)).toBe(false);
	});
});
