/**
 * Tests for suppressQueryResponses.
 *
 * Proves that the renderer xterm does NOT generate duplicate query responses
 * when interactive CLI tools (gh, vercel, etc.) send terminal queries.
 * The headless emulator in the daemon already handles these queries —
 * the renderer must suppress them to avoid sending duplicate responses
 * that appear as garbled escape sequences (\x1b] overflow) in the output.
 *
 * Reproduction for: https://github.com/supersetapp/superset/issues/3499
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// xterm requires `window` to be defined even in headless mode.
// Must be set before dynamic imports below.
if (typeof window === "undefined") {
	(globalThis as Record<string, unknown>).window = globalThis;
}

const { Terminal } = await import("@xterm/headless");
const { suppressQueryResponses } = await import("./suppressQueryResponses");

type TerminalType = InstanceType<typeof Terminal>;

const ESC = "\x1b";
const CSI = `${ESC}[`;
const BEL = "\x07";

function writeSync(terminal: TerminalType, data: string): Promise<void> {
	return new Promise<void>((resolve) => {
		terminal.write(data, resolve);
	});
}

describe("suppressQueryResponses", () => {
	let terminal: TerminalType;
	let cleanup: () => void;

	beforeEach(() => {
		terminal = new Terminal({
			cols: 80,
			rows: 24,
			allowProposedApi: true,
		});
		cleanup = suppressQueryResponses(terminal);
	});

	afterEach(() => {
		cleanup();
		terminal.dispose();
	});

	describe("DA (Device Attributes) query suppression", () => {
		test("should suppress DA1 query and prevent duplicate response", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// CLI tool sends DA1 query via PTY output
			await writeSync(terminal, `${CSI}c`);

			// Renderer xterm should NOT generate a DA1 response
			// because the headless emulator in the daemon already handles it.
			// Without suppression, xterm would emit something like \x1b[?62;4;9;22c
			expect(responses.length).toBe(0);
		});

		test("should suppress DA1 query with explicit parameter 0", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			await writeSync(terminal, `${CSI}0c`);
			expect(responses.length).toBe(0);
		});

		test("should suppress DA2 (secondary) query", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// DA2 query: CSI > c
			await writeSync(terminal, `${CSI}>c`);
			expect(responses.length).toBe(0);
		});

		test("should suppress DA3 (tertiary) query", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// DA3 query: CSI = c
			await writeSync(terminal, `${CSI}=c`);
			expect(responses.length).toBe(0);
		});
	});

	describe("DSR (Device Status Report) query suppression", () => {
		test("should suppress DSR status query (CSI 5n)", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			await writeSync(terminal, `${CSI}5n`);
			expect(responses.length).toBe(0);
		});

		test("should suppress DSR cursor position query (CSI 6n)", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// DSR 6 — cursor position report
			await writeSync(terminal, `${CSI}6n`);
			expect(responses.length).toBe(0);
		});
	});

	describe("OSC color query suppression", () => {
		test("should suppress OSC 11 background color query", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// OSC 11 background color query — this is the \x1b] sequence
			// that the issue reporter saw overflowing in the terminal output
			await writeSync(terminal, `${ESC}]11;?${BEL}`);
			expect(responses.length).toBe(0);
		});

		test("should suppress OSC 10 foreground color query", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			await writeSync(terminal, `${ESC}]10;?${BEL}`);
			expect(responses.length).toBe(0);
		});

		test("should not suppress OSC 0 (window title) — it is not a query", async () => {
			// OSC 0 sets the window title and doesn't generate a response.
			// It should NOT be suppressed.
			await writeSync(terminal, `${ESC}]0;My Title${BEL}`);
			// Just verify no error — title changes don't generate onData responses
		});
	});

	describe("existing suppressions still work", () => {
		test("should suppress CPR response (CSI R)", async () => {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// CPR response that might echo back from daemon
			await writeSync(terminal, `${CSI}24;1R`);
			// Should be suppressed (existing behavior)
		});

		test("should suppress focus reports (CSI I/O)", async () => {
			await writeSync(terminal, `${CSI}I`);
			await writeSync(terminal, `${CSI}O`);
			// No error — these are silently consumed
		});
	});

	describe("normal terminal output is not affected", () => {
		test("should render SGR color sequences normally", async () => {
			await writeSync(terminal, `${CSI}32mGreen text${CSI}0m`);
			// No error — color sequences should work fine
		});

		test("should render cursor movement sequences normally", async () => {
			await writeSync(terminal, `${CSI}10;20H`);
			await writeSync(terminal, "Text at position");
			// No error — cursor movement should work
		});

		test("should render OSC 8 hyperlinks normally", async () => {
			await writeSync(
				terminal,
				`${ESC}]8;;https://example.com${BEL}link text${ESC}]8;;${BEL}`,
			);
			// No error — hyperlinks should not be suppressed
		});
	});
});

describe("without suppressQueryResponses — proves the bug exists", () => {
	test("unsuppressed xterm generates DA1 response that would be sent as duplicate", async () => {
		// This test demonstrates the bug: without suppression, the renderer
		// xterm generates a DA1 response that would be forwarded to the PTY
		// subprocess, causing the CLI tool to receive duplicate responses.
		const terminal = new Terminal({
			cols: 80,
			rows: 24,
			allowProposedApi: true,
		});

		try {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// Send DA1 query (as if a CLI tool sent it via PTY output)
			await writeSync(terminal, `${CSI}c`);

			// Without suppression, xterm generates a DA1 response.
			// This response starts with \x1b[ and would be forwarded to the PTY
			// via handleTerminalInput → session.write(), causing a duplicate.
			expect(responses.length).toBeGreaterThan(0);
			expect(responses[0]?.startsWith(`${ESC}[`)).toBe(true);
		} finally {
			terminal.dispose();
		}
	});

	test("unsuppressed xterm generates DSR response (CPR) that would be sent as duplicate", async () => {
		const terminal = new Terminal({
			cols: 80,
			rows: 24,
			allowProposedApi: true,
		});

		try {
			const responses: string[] = [];
			terminal.onData((data) => responses.push(data));

			// DSR 6: cursor position report
			await writeSync(terminal, `${CSI}6n`);

			// Without suppression, xterm generates CSI row;col R response
			expect(responses.length).toBeGreaterThan(0);
			// Response format: ESC[row;colR
			const resp = responses[0] ?? "";
			expect(resp.startsWith(`${ESC}[`)).toBe(true);
			expect(resp.endsWith("R")).toBe(true);
		} finally {
			terminal.dispose();
		}
	});
});
