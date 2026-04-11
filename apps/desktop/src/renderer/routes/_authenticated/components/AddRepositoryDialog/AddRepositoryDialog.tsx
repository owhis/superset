import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useAddRepositoryDialogOpen,
	useCloseAddRepositoryDialog,
} from "renderer/stores/add-repository-dialog";
import { ProjectSetupStep } from "../ProjectSetupStep";

export function AddRepositoryDialog() {
	const isOpen = useAddRepositoryDialogOpen();
	const closeDialog = useCloseAddRepositoryDialog();
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q.from({ projects: collections.v2Projects }).select(({ projects }) => ({
				id: projects.id,
				name: projects.name,
				githubRepositoryId: projects.githubRepositoryId,
			})),
		[collections],
	);

	const { data: githubRepositories } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
				name: repos.name,
			})),
		[collections],
	);

	const projects = useMemo(() => {
		const repoById = new Map((githubRepositories ?? []).map((r) => [r.id, r]));
		return (v2Projects ?? [])
			.filter((p) => p.githubRepositoryId)
			.map((p) => {
				const repo = p.githubRepositoryId
					? repoById.get(p.githubRepositoryId)
					: null;
				return {
					id: p.id,
					name: p.name,
					repoSlug: repo ? `${repo.owner}/${repo.name}` : null,
				};
			});
	}, [v2Projects, githubRepositories]);

	const selectedProject = projects.find((p) => p.id === selectedProjectId);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			closeDialog();
			setSelectedProjectId(null);
		}
	};

	const handleSetupComplete = () => {
		closeDialog();
		setSelectedProjectId(null);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogHeader className="sr-only">
				<DialogTitle>Add Repository</DialogTitle>
				<DialogDescription>
					Set up a project repository on this device
				</DialogDescription>
			</DialogHeader>
			<DialogContent className="sm:max-w-[420px]">
				<div className="space-y-4">
					<div className="space-y-1">
						<h2 className="text-base font-semibold">Add Repository</h2>
						<p className="text-xs text-muted-foreground">
							Select a project and point it to a local checkout or clone it.
						</p>
					</div>

					<div className="space-y-2">
						<Label className="text-sm">Project</Label>
						<Select
							value={selectedProjectId ?? ""}
							onValueChange={setSelectedProjectId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a project..." />
							</SelectTrigger>
							<SelectContent>
								{projects.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										<span>{p.name}</span>
										{p.repoSlug && (
											<span className="ml-2 text-muted-foreground text-xs">
												{p.repoSlug}
											</span>
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedProject && activeHostUrl && (
						<ProjectSetupStep
							projectId={selectedProject.id}
							projectName={selectedProject.name}
							hostUrl={activeHostUrl}
							onSetupComplete={handleSetupComplete}
							submitLabel="Add Repository"
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
