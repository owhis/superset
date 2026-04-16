export type ErrorReason =
	| "not-found"
	| "too-large"
	| "is-directory"
	| "binary-unsupported";

interface ErrorStateProps {
	reason: ErrorReason;
}

const MESSAGES: Record<ErrorReason, string> = {
	"not-found": "File not found",
	"too-large": "File is too large to preview",
	"is-directory": "This path is a directory",
	"binary-unsupported": "Binary file — cannot display",
};

export function ErrorState({ reason }: ErrorStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
			{MESSAGES[reason]}
		</div>
	);
}
