import { MultiFileDiff } from "@pierre/diffs/react";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { getDiffsTheme } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import type { DiffFileSource } from "../../../../../useChangeset";
import { DiffFileHeader } from "../DiffFileHeader";
import { buildDiffThemeVars } from "./utils/buildDiffThemeVars";

interface WorkspaceDiffProps {
	workspaceId: string;
	path: string;
	status: string;
	source: DiffFileSource;
	additions: number;
	deletions: number;
	diffStyle: "split" | "unified";
	expandUnchanged: boolean;
	onToggleExpandUnchanged: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
	onOpenFile?: () => void;
}

export const WorkspaceDiff = memo(function WorkspaceDiff({
	workspaceId,
	path,
	status,
	source,
	additions,
	deletions,
	diffStyle,
	expandUnchanged,
	onToggleExpandUnchanged,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
	onOpenFile,
}: WorkspaceDiffProps) {
	const activeTheme = useResolvedTheme();
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});
	const shikiTheme = getDiffsTheme(activeTheme);
	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const themeVars = buildDiffThemeVars(activeTheme, {
		fontFamily: fontSettings?.editorFontFamily ?? undefined,
		fontSize: Number.isFinite(parsedEditorFontSize)
			? parsedEditorFontSize
			: undefined,
	});

	const diffInput = useMemo(() => {
		if (source.kind === "against-base") {
			return {
				workspaceId,
				path,
				category: "against-base" as const,
				baseBranch: source.baseBranch ?? undefined,
			};
		}
		if (source.kind === "commit") {
			return {
				workspaceId,
				path,
				category: "commit" as const,
				commitHash: source.commitHash,
				fromHash: source.fromHash,
			};
		}
		return { workspaceId, path, category: source.kind };
	}, [workspaceId, path, source]);

	const diffQuery = workspaceTrpc.git.getDiff.useQuery(diffInput, {
		staleTime: Number.POSITIVE_INFINITY,
	});

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath;

	const { copyToClipboard } = useCopyToClipboard();
	const newContents = diffQuery.data?.newFile.contents;
	const handleCopyContents = useMemo(
		() =>
			newContents != null ? () => copyToClipboard(newContents) : undefined,
		[newContents, copyToClipboard],
	);

	const handleDiscard = useMemo(() => {
		if (source.kind !== "unstaged" || !worktreePath) return undefined;
		return () => {
			electronTrpcClient.changes.discardChanges
				.mutate({ worktreePath, filePath: path })
				.catch((err) => {
					toast.error("Couldn't discard changes", {
						description: err instanceof Error ? err.message : String(err),
					});
				});
		};
	}, [source.kind, worktreePath, path]);

	return (
		<div className="flex flex-col overflow-hidden rounded-md border border-border">
			<DiffFileHeader
				path={path}
				status={status}
				additions={additions}
				deletions={deletions}
				expandUnchanged={expandUnchanged}
				onToggleExpandUnchanged={onToggleExpandUnchanged}
				collapsed={collapsed}
				onToggleCollapsed={onToggleCollapsed}
				viewed={viewed}
				onToggleViewed={onToggleViewed}
				onOpenFile={onOpenFile}
				onCopyContents={handleCopyContents}
				onDiscard={handleDiscard}
			/>
			{diffQuery.data ? (
				<MultiFileDiff
					oldFile={diffQuery.data.oldFile}
					newFile={diffQuery.data.newFile}
					style={themeVars}
					options={{
						diffStyle,
						expandUnchanged,
						overflow: "wrap",
						collapsed,
						disableFileHeader: true,
						theme: shikiTheme,
						themeType: activeTheme.type,
						unsafeCSS: `
							* {
								user-select: text;
								-webkit-user-select: text;
							}
						`,
					}}
				/>
			) : null}
		</div>
	);
});
