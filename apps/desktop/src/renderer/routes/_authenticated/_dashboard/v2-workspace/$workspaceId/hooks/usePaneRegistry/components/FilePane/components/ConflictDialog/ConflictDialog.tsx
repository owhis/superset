import { MultiFileDiff } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useResolvedTheme } from "renderer/stores/theme";

interface ConflictDialogProps {
	open: boolean;
	filePath: string;
	localContent: string;
	diskContent: string | null;
	pendingSave: boolean;
	onKeepEditing: () => void;
	onReload: () => void;
	onOverwrite: () => void;
}

export function ConflictDialog({
	open,
	filePath,
	localContent,
	diskContent,
	pendingSave,
	onKeepEditing,
	onReload,
	onOverwrite,
}: ConflictDialogProps) {
	const resolvedTheme = useResolvedTheme();
	const displayDiskContent = diskContent ?? "";

	return (
		<Dialog
			open={open}
			onOpenChange={pendingSave ? undefined : onKeepEditing}
			modal
		>
			<DialogContent className="max-w-[min(1100px,calc(100vw-2rem))] p-0">
				<div className="flex max-h-[85vh] flex-col">
					<DialogHeader className="border-b px-6 pt-6">
						<DialogTitle>File Changed On Disk</DialogTitle>
						<DialogDescription>
							{diskContent === null
								? `${filePath} was removed or is no longer readable. Review the difference before choosing whether to overwrite it.`
								: `${filePath} changed on disk after you started editing. Review the diff before saving.`}
						</DialogDescription>
					</DialogHeader>
					<div className="min-h-0 flex-1 overflow-auto">
						<MultiFileDiff
							oldFile={{ name: filePath, contents: displayDiskContent }}
							newFile={{ name: filePath, contents: localContent }}
							options={{
								diffStyle: "unified",
								expandUnchanged: true,
								themeType: resolvedTheme.type,
								overflow: "wrap",
								disableFileHeader: true,
							}}
						/>
					</div>
					<DialogFooter className="border-t px-6 py-4">
						<Button
							variant="outline"
							onClick={onKeepEditing}
							disabled={pendingSave}
						>
							Keep Editing
						</Button>
						<Button variant="outline" onClick={onReload} disabled={pendingSave}>
							Reload From Disk
						</Button>
						<Button onClick={onOverwrite} disabled={pendingSave}>
							Overwrite File
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
