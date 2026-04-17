import type { RendererContext } from "@superset/panes";
import { useCallback, useEffect } from "react";
import { useSharedFileDocument } from "../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { ConflictDialog } from "./components/ConflictDialog";
import { ErrorState } from "./components/ErrorState";
import { ExternalChangeBar } from "./components/ExternalChangeBar";
import { LoadingState } from "./components/LoadingState";
import { OrphanedBanner } from "./components/OrphanedBanner";
import { SaveErrorBanner } from "./components/SaveErrorBanner";
import { resolveActivePaneView } from "./registry";

interface FilePaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePane({ context, workspaceId }: FilePaneProps) {
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;

	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});

	// Mirror document dirty state back into the pane data so the tab indicator stays in sync.
	useEffect(() => {
		if (document.dirty !== data.hasChanges) {
			context.actions.updateData({
				...data,
				hasChanges: document.dirty,
			} as PaneViewerData);
		}
	}, [document.dirty, data, context.actions]);

	const handleChangeView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	const handleForceView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				forceViewId: viewId,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	// Content gating — LoadingState/ErrorState rendered before view resolution when
	// there's nothing for the view to consume.
	if (document.content.kind === "loading") {
		return <LoadingState />;
	}
	if (document.content.kind === "not-found" && !document.orphaned) {
		return <ErrorState reason="not-found" />;
	}
	if (document.content.kind === "too-large") {
		return <ErrorState reason="too-large" />;
	}
	if (document.content.kind === "is-directory") {
		return <ErrorState reason="is-directory" />;
	}

	// The same resolution runs in FilePaneHeaderExtras — toggle + active view
	// stay in lockstep because both observe the same pane data + document.
	const { activeView } = resolveActivePaneView(document, data);
	if (!activeView) {
		return <ErrorState reason="binary-unsupported" />;
	}

	const ViewRenderer = activeView.Renderer;
	const localContent =
		document.content.kind === "text" ? document.content.value : "";

	return (
		<div className="flex h-full w-full flex-col">
			{document.orphaned && (
				<OrphanedBanner
					dirty={document.dirty}
					onDiscard={() => void document.reload()}
				/>
			)}
			{document.hasExternalChange && !document.conflict && (
				<ExternalChangeBar onReload={() => void document.reload()} />
			)}
			{document.saveError && (
				<SaveErrorBanner
					message={document.saveError.message}
					onRetry={() => void document.save()}
					onDismiss={() => document.clearSaveError()}
				/>
			)}
			<div className="min-h-0 min-w-0 flex-1">
				<ViewRenderer
					document={document}
					filePath={filePath}
					workspaceId={workspaceId}
					onChangeView={handleChangeView}
					onForceView={handleForceView}
				/>
			</div>
			{document.conflict && (
				<ConflictDialog
					open
					filePath={filePath}
					localContent={localContent}
					diskContent={document.conflict.diskContent}
					pendingSave={document.pendingSave}
					onKeepEditing={() => void document.resolveConflict("keep")}
					onReload={() => void document.resolveConflict("reload")}
					onOverwrite={() => void document.resolveConflict("overwrite")}
				/>
			)}
		</div>
	);
}
