import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useSharedFileDocument } from "../../../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import {
	ALL_VIEWS,
	type FileMeta,
	orderForToggle,
	pickDefaultView,
	resolveViews,
} from "../../registry";
import { FileViewToggle } from "../FileViewToggle";

interface FilePaneHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePaneHeaderExtras({
	context,
	workspaceId,
}: FilePaneHeaderExtrasProps) {
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;

	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});

	const handleChangeView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	// Same resolution as FilePane body, so the toggle and the active renderer stay in lockstep.
	const meta: FileMeta = {
		size: document.byteSize ?? undefined,
		isBinary: document.isBinary ?? undefined,
	};
	const views = data.forceViewId
		? ALL_VIEWS.filter((v) => v.id === data.forceViewId)
		: resolveViews(filePath, meta);

	if (views.length <= 1 || data.forceViewId) return null;

	const activeView =
		views.find((v) => v.id === data.viewId) ?? pickDefaultView(views);
	if (!activeView) return null;

	return (
		<FileViewToggle
			views={orderForToggle(views)}
			activeViewId={activeView.id}
			filePath={filePath}
			onChange={handleChangeView}
		/>
	);
}
