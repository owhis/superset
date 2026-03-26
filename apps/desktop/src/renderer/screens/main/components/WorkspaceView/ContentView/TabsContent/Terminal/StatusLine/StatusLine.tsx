/**
 * StatusLine renders a persistent status bar at the bottom of the terminal.
 *
 * This implements the terminal "status line" feature (terminfo hs/tsl/fsl)
 * that tools like Claude Code's ccstatusline use. The terminal sends status
 * text via OSC 0/2 sequences, which xterm.js exposes through onTitleChange.
 * This component captures that text and renders it as a visible bar, matching
 * the behavior of iTerm2 and other terminals with status line support.
 */

interface StatusLineProps {
	text: string | null;
	backgroundColor?: string;
}

export function StatusLine({ text, backgroundColor }: StatusLineProps) {
	if (!text) return null;

	return (
		<div
			className="flex shrink-0 items-center overflow-hidden border-t border-white/10 px-3 py-0.5 font-mono text-xs text-white/60"
			style={{ backgroundColor }}
		>
			<span className="truncate">{text}</span>
		</div>
	);
}
