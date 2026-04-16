import type { Terminal } from "@xterm/xterm";

/**
 * Registers parser hooks to suppress terminal query responses and queries
 * on the renderer's xterm instance.
 *
 * In Superset's terminal architecture, both a headless emulator (in the daemon)
 * and the renderer's xterm process the same PTY output stream. When a CLI tool
 * sends a terminal query (e.g., DA1, DSR, OSC color query), BOTH would generate
 * responses. The headless emulator's response goes directly to the PTY subprocess.
 * The renderer's response would also be forwarded via handleTerminalInput →
 * session.write(), causing the CLI tool to receive DUPLICATE responses.
 *
 * These duplicate responses manifest as garbled escape sequences (\x1b] or \x1b[)
 * appearing in the terminal output, breaking interactive CLI tools like gh, vercel,
 * and others that rely on terminal query responses for capability detection.
 *
 * We suppress:
 * 1. Terminal queries (so the renderer doesn't generate responses at all)
 * 2. Response-only sequences (that might echo back from the daemon)
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	const disposables: { dispose: () => void }[] = [];
	const parser = terminal.parser;

	// =========================================================================
	// Suppress terminal QUERIES — prevents renderer from generating responses.
	// The headless emulator in the daemon handles these instead.
	// =========================================================================

	// DA1 (Device Attributes primary): CSI c or CSI 0 c
	// Response would be: CSI ? 62;4;9;22 c (with '?' prefix — distinct final)
	// Suppressing queries without prefix is safe: it won't match DA1 responses
	// (which have '?' prefix) or DA2 queries (which have '>' prefix).
	disposables.push(parser.registerCsiHandler({ final: "c" }, () => true));

	// DA2 (Device Attributes secondary): CSI > c
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "c" }, () => true),
	);

	// DA3 (Device Attributes tertiary): CSI = c
	disposables.push(
		parser.registerCsiHandler({ prefix: "=", final: "c" }, () => true),
	);

	// DSR (Device Status Report): CSI 5n (status), CSI 6n (cursor position), etc.
	// All CSI sequences ending in 'n' are status-request queries.
	disposables.push(parser.registerCsiHandler({ final: "n" }, () => true));

	// DSR with '?' prefix: CSI ? 6 n (extended cursor position)
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "n" }, () => true),
	);

	// OSC color queries — only suppress actual queries (data === "?"),
	// not set operations (which carry color values).
	// OSC 4: Color palette query
	disposables.push(parser.registerOscHandler(4, (data) => data.includes("?")));
	// OSC 10: Foreground color query
	disposables.push(parser.registerOscHandler(10, (data) => data === "?"));
	// OSC 11: Background color query
	disposables.push(parser.registerOscHandler(11, (data) => data === "?"));
	// OSC 12: Cursor color query
	disposables.push(parser.registerOscHandler(12, (data) => data === "?"));

	// =========================================================================
	// Suppress RESPONSE-ONLY sequences — prevents garbled text if a response
	// echoes back through the data stream.
	// =========================================================================

	// CSI R: Cursor Position Report response (query is CSI 6n, different final)
	disposables.push(parser.registerCsiHandler({ final: "R" }, () => true));

	// CSI I/O: Focus In/Out reports (no query — just mode 1004 events)
	disposables.push(parser.registerCsiHandler({ final: "I" }, () => true));
	disposables.push(parser.registerCsiHandler({ final: "O" }, () => true));

	// CSI $y: Mode report response (query is CSI $p, different final)
	disposables.push(
		parser.registerCsiHandler({ intermediates: "$", final: "y" }, () => true),
	);

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
