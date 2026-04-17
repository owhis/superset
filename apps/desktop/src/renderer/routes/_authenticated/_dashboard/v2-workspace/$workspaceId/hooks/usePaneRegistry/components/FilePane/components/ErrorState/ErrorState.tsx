import { Button } from "@superset/ui/button";

export type ErrorReason =
	| "not-found"
	| "too-large"
	| "is-directory"
	| "binary-unsupported";

interface ErrorStateProps {
	reason: ErrorReason;
	onOpenAnyway?: () => void;
}

const MESSAGES: Record<ErrorReason, string> = {
	"not-found": "File not found",
	"too-large": "File is too large to preview",
	"is-directory": "This path is a directory",
	"binary-unsupported": "Binary file — cannot display",
};

export function ErrorState({ reason, onOpenAnyway }: ErrorStateProps) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			{MESSAGES[reason]}
			{reason === "too-large" && onOpenAnyway && (
				<Button variant="outline" size="sm" onClick={onOpenAnyway}>
					Open anyway
				</Button>
			)}
		</div>
	);
}
