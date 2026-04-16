import type { RendererContext } from "@superset/panes";
import { useEffect } from "react";
import { useSharedFileDocument } from "../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { ErrorState } from "./components/ErrorState";
import { LoadingState } from "./components/LoadingState";
import { pickDefaultView, resolveViews } from "./registry";

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

	// Content gating — nothing mounts until the document has renderable content.
	if (document.content.kind === "loading") {
		return <LoadingState />;
	}
	if (document.content.kind === "not-found") {
		return <ErrorState reason="not-found" />;
	}
	if (document.content.kind === "too-large") {
		return <ErrorState reason="too-large" />;
	}
	if (document.content.kind === "is-directory") {
		return <ErrorState reason="is-directory" />;
	}
	if (document.content.kind === "bytes") {
		// PR 1 does not ship a bytes-capable view. Image/binary views arrive in PR 2.
		return <ErrorState reason="binary-unsupported" />;
	}

	const views = resolveViews(filePath, {});
	const activeView = pickDefaultView(views);
	if (!activeView) {
		return <ErrorState reason="binary-unsupported" />;
	}

	const ViewRenderer = activeView.Renderer;

	return (
		<ViewRenderer
			document={document}
			filePath={filePath}
			workspaceId={workspaceId}
		/>
	);
}
