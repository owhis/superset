import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { toast } from "@superset/ui/sonner";
import { FolderFirstImportModal } from "./components/FolderFirstImportModal";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	type AvailableV2Project,
	useAvailableV2Projects,
} from "./hooks/useAvailableV2Projects";
import { useFolderFirstImport } from "./hooks/useFolderFirstImport";
import { useV2WorkspacesFilterStore } from "./stores/v2WorkspacesFilterStore";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
});

function V2WorkspacesPage() {
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const resetFilters = useV2WorkspacesFilterStore((state) => state.reset);

	// Start with a fresh view every time the discovery page mounts — otherwise
	// the zustand singleton would carry over a stale search/device filter from a
	// previous visit with no visible indication that a filter is active.
	useEffect(() => {
		resetFilters();
	}, [resetFilters]);

	const { pinned, others, counts } = useAccessibleV2Workspaces({ searchQuery });
	const { projects: availableProjects } = useAvailableV2Projects({
		searchQuery,
	});
	const hasAnyAccessible = pinned.length > 0 || others.length > 0;

	const folderImport = useFolderFirstImport({
		onSuccess: () => {
			toast.success("Project ready — open it from the sidebar.");
		},
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
	});

	// "+ New project" and per-row "Pin & set up" still land in later
	// iterations (create-via-clone-url modal, setup-modal-for-existing
	// projectId). For now they're stubs so the section shape is in place.
	const handleCreateNewProject = useCallback(() => {
		toast.message("New project modal coming soon.");
	}, []);
	const handlePinAndSetup = useCallback((project: AvailableV2Project) => {
		toast.message(`"Pin & set up" coming soon — ${project.name}`);
	}, []);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<V2WorkspacesHeader counts={counts} />
			<V2WorkspacesList
				pinned={pinned}
				others={others}
				availableProjects={availableProjects}
				hasAnyAccessible={hasAnyAccessible}
				onCreateNewProject={handleCreateNewProject}
				onImportExistingFolder={folderImport.start}
				onPinAndSetup={handlePinAndSetup}
			/>
			<FolderFirstImportModal
				state={folderImport.state}
				onCancel={folderImport.cancel}
				onConfirmCreateAsNew={folderImport.confirmCreateAsNew}
				onConfirmPickCandidate={folderImport.confirmPickCandidate}
			/>
		</div>
	);
}
