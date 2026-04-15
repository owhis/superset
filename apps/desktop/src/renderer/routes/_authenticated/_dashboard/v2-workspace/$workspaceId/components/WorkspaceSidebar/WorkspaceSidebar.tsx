import { Button } from "@superset/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { FileText, GitCompareArrows, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import type { CommentPaneData } from "../../types";
import { FilesTab } from "./components/FilesTab";
import { SidebarHeader } from "./components/SidebarHeader";
import { useChangesTab } from "./hooks/useChangesTab";
import { useReviewTab } from "./hooks/useReviewTab";
import type { SidebarTabDefinition } from "./types";

const subtabTriggerClassName = cn(
	"flex h-full flex-none shrink-0 items-center gap-2 rounded-none border-0 bg-transparent px-3 text-sm font-normal shadow-none transition-all outline-none",
	"data-[state=active]:bg-border/30 data-[state=active]:text-foreground data-[state=active]:shadow-none",
	"data-[state=inactive]:text-muted-foreground/70 data-[state=inactive]:hover:bg-tertiary/20 data-[state=inactive]:hover:text-muted-foreground",
);

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onSelectDiffFile?: (path: string) => void;
	onOpenComment?: (comment: CommentPaneData) => void;
	onSearch?: () => void;
	selectedFilePath?: string;
	workspaceId: string;
	workspaceName?: string;
}

function IconButton({
	icon: Icon,
	tooltip,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>;
	tooltip: string;
	onClick?: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClick}
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

export function WorkspaceSidebar({
	onSelectFile,
	onSelectDiffFile,
	onOpenComment,
	onSearch,
	selectedFilePath,
	workspaceId,
	workspaceName,
}: WorkspaceSidebarProps) {
	const [activeTab, setActiveTab] = useState("changes");
	const [changesSubtab, setChangesSubtab] = useState<"diffs" | "review">(
		"diffs",
	);

	const gitStatus = useGitStatus(workspaceId);

	const changesTab = useChangesTab({
		workspaceId,
		gitStatus,
		onSelectFile: onSelectDiffFile,
	});

	const reviewTab = useReviewTab({ workspaceId, onOpenComment });

	const filesTab: SidebarTabDefinition = useMemo(
		() => ({
			id: "files",
			label: "Files",
			icon: FileText,
			actions: <IconButton icon={Search} tooltip="Search" onClick={onSearch} />,
			content: (
				<FilesTab
					onSelectFile={onSelectFile}
					selectedFilePath={selectedFilePath}
					workspaceId={workspaceId}
					workspaceName={workspaceName}
					gitStatus={gitStatus.data}
				/>
			),
		}),
		[
			gitStatus.data,
			onSearch,
			onSelectFile,
			selectedFilePath,
			workspaceId,
			workspaceName,
		],
	);

	const combinedChangesTab: SidebarTabDefinition = useMemo(
		() => ({
			id: "changes",
			label: "Changes",
			icon: GitCompareArrows,
			badge: changesTab.badge,
			actions:
				changesSubtab === "diffs" ? changesTab.actions : reviewTab.actions,
			content: (
				<Tabs
					value={changesSubtab}
					onValueChange={(v) => setChangesSubtab(v as "diffs" | "review")}
					className="flex min-h-0 flex-1 flex-col gap-0"
				>
					<div className="h-8 shrink-0 border-b bg-background">
						<TabsList className="grid h-full w-full grid-cols-2 items-stretch gap-0 rounded-none bg-transparent p-0">
							<TabsTrigger
								value="diffs"
								className={cn(subtabTriggerClassName, "w-full justify-center")}
							>
								<span>Diffs</span>
								{changesTab.badge != null && (
									<span className="text-[11px] text-muted-foreground/60 tabular-nums">
										{changesTab.badge}
									</span>
								)}
							</TabsTrigger>
							<TabsTrigger
								value="review"
								className={cn(subtabTriggerClassName, "w-full justify-center")}
							>
								<span>Review</span>
								{reviewTab.badge != null && reviewTab.badge > 0 && (
									<span className="text-[11px] text-muted-foreground/60 tabular-nums">
										{reviewTab.badge}
									</span>
								)}
							</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent
						value="diffs"
						className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
					>
						{changesTab.content}
					</TabsContent>
					<TabsContent
						value="review"
						className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
					>
						{reviewTab.content}
					</TabsContent>
				</Tabs>
			),
		}),
		[changesTab, reviewTab, changesSubtab],
	);

	const tabs = [combinedChangesTab, filesTab];
	const activeTabDef = tabs.find((t) => t.id === activeTab);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background">
			<SidebarHeader
				tabs={tabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
			/>
			<div className="min-h-0 flex-1">{activeTabDef?.content}</div>
		</div>
	);
}
