import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { PinAndSetupTarget } from "renderer/stores/add-repository-modal";
import { ParentDirectoryPicker } from "../ParentDirectoryPicker";

interface PinAndSetupModalProps {
	project: PinAndSetupTarget | null;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: { projectId: string; repoPath: string }) => void;
	onError?: (message: string) => void;
}

export function PinAndSetupModal({
	project,
	onOpenChange,
	onSuccess,
	onError,
}: PinAndSetupModalProps) {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const [parentDir, setParentDir] = useState<string | null>(null);
	const [working, setWorking] = useState(false);

	const canSubmit = project !== null && parentDir !== null && !working;

	const reset = () => {
		setParentDir(null);
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit || !activeHostUrl || !project || !parentDir) return;

		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.setup.mutate({
				projectId: project.id,
				mode: { kind: "clone", parentDir },
			});
			ensureProjectInSidebar(project.id);
			queryClient.invalidateQueries({
				queryKey: ["project", "list", activeHostUrl],
			});
			onSuccess?.({ projectId: project.id, repoPath: result.repoPath });
			reset();
			onOpenChange(false);
		} catch (err) {
			onError?.(err instanceof Error ? err.message : String(err));
			setWorking(false);
		}
	};

	return (
		<Dialog open={project !== null} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Pin & set up</DialogTitle>
						<DialogDescription>
							Clone {project?.name ?? "the project"} onto this device and pin
							it to the sidebar.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 py-4">
						{project && (
							<div className="space-y-1">
								<Label className="text-xs text-muted-foreground">Project</Label>
								<div className="rounded bg-muted px-2 py-1.5 text-sm">
									{project.name}
									{project.githubOwner && project.githubRepoName && (
										<span className="ml-2 text-xs text-muted-foreground">
											{project.githubOwner}/{project.githubRepoName}
										</span>
									)}
								</div>
							</div>
						)}
						<div className="space-y-1">
							<Label>Parent directory</Label>
							<ParentDirectoryPicker
								value={parentDir}
								onChange={setParentDir}
								disabled={working}
								dialogTitle="Select where to clone the project"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							{working ? "Setting up…" : "Pin & set up"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
