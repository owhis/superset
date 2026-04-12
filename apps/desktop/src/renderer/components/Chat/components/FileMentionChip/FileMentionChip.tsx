interface FileMentionChipProps {
	relativePath: string;
	disabled?: boolean;
	onClick: () => void;
}

export function FileMentionChip({
	relativePath,
	disabled,
	onClick,
}: FileMentionChipProps) {
	return (
		<button
			type="button"
			className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:opacity-60"
			onClick={onClick}
			disabled={disabled}
			aria-label={`Open file ${relativePath}`}
		>
			<span className="font-semibold text-primary/70">@</span>
			<span>{relativePath}</span>
		</button>
	);
}
