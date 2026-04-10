/** Check if a KeyboardEvent matches a terminal-reserved chord */
const TERMINAL_RESERVED = new Set([
	"ctrl+c",
	"ctrl+d",
	"ctrl+z",
	"ctrl+s",
	"ctrl+q",
	"ctrl+\\",
	// Readline shortcuts — must stay in terminal, not bubble to app hotkeys
	"ctrl+r", // reverse history search
	"ctrl+l", // clear screen
	"ctrl+a", // beginning of line
	"ctrl+e", // end of line
	"ctrl+w", // delete word backward
	"ctrl+k", // kill to end of line
	"ctrl+u", // clear line before cursor
	"ctrl+p", // previous history
	"ctrl+n", // next history
	"ctrl+b", // move cursor back
	"ctrl+f", // move cursor forward
	"ctrl+y", // yank (paste killed text)
]);

export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
	if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
		return false;
	const key = event.key.toLowerCase();
	return TERMINAL_RESERVED.has(`ctrl+${key}`);
}
