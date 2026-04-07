import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";

interface CloseTerminalDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	terminalCount: number;
}

export function CloseTerminalDialog({
	open,
	onOpenChange,
	onConfirm,
	terminalCount,
}: CloseTerminalDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Close Terminal?</AlertDialogTitle>
					<AlertDialogDescription>
						{terminalCount === 1
							? "This tab has an active terminal session. Closing it will kill the session."
							: `This tab has ${terminalCount} active terminal sessions. Closing it will kill all sessions.`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						Close Tab
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
