import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/types";
import { AgentPicker } from "./components/AgentPicker";
import { ProjectPicker } from "./components/ProjectPicker";
import {
	CUSTOM_SCHEDULE_KEY,
	SCHEDULE_PRESETS,
	SchedulePicker,
} from "./components/SchedulePicker";
import { useRecentProjects } from "./hooks/useRecentProjects";

export type AutomationCreatedPayload = { id: string; name: string };

interface CreateAutomationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (automation: AutomationCreatedPayload) => void;
}

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function CreateAutomationDialog({
	open,
	onOpenChange,
	onCreated,
}: CreateAutomationDialogProps) {
	const defaultScheduleKey = SCHEDULE_PRESETS[0]?.key ?? CUSTOM_SCHEDULE_KEY;
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [hostTarget, setHostTarget] = useState<WorkspaceHostTarget>({
		kind: "local",
	});
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [agentType, setAgentType] = useState("claude");
	const [scheduleKey, setScheduleKey] = useState(defaultScheduleKey);
	const [customRrule, setCustomRrule] = useState("");

	const { localHostId } = useWorkspaceHostOptions();
	const recentProjects = useRecentProjects();
	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);

	// Default to first project once the Electric-synced list lands.
	useEffect(() => {
		if (!open) return;
		if (selectedProjectId) return;
		const first = recentProjects[0];
		if (first) setSelectedProjectId(first.id);
	}, [open, selectedProjectId, recentProjects]);

	useEffect(() => {
		if (!open) {
			setName("");
			setPrompt("");
			setHostTarget({ kind: "local" });
			setSelectedProjectId(null);
			setAgentType("claude");
			setScheduleKey(defaultScheduleKey);
			setCustomRrule("");
		}
	}, [open, defaultScheduleKey]);

	const isCustom = scheduleKey === CUSTOM_SCHEDULE_KEY;
	const selectedPreset = SCHEDULE_PRESETS.find((p) => p.key === scheduleKey);
	const selectedRrule = isCustom
		? customRrule.trim()
		: (selectedPreset?.rrule ?? "");
	const selectedScheduleLabel = isCustom
		? customRrule
			? "Custom"
			: "Choose schedule"
		: (selectedPreset?.label ?? "Choose schedule");

	const targetHostId =
		hostTarget.kind === "host" ? hostTarget.hostId : localHostId;

	const createMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.create.mutate({
				name,
				prompt,
				agentType,
				targetHostId: targetHostId ?? null,
				workspaceMode: "new_per_run",
				v2ProjectId: selectedProjectId,
				v2WorkspaceId: null,
				rrule: selectedRrule,
				timezone: DEFAULT_TIMEZONE,
				mcpScope: [],
			}),
		onSuccess: (result) => onCreated({ id: result.id, name: result.name }),
	});

	const canSubmit =
		name.trim().length > 0 &&
		prompt.trim().length > 0 &&
		!!selectedProjectId &&
		!!targetHostId &&
		selectedRrule.length > 0 &&
		!createMutation.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[800px] p-0 gap-0 overflow-hidden"
				aria-describedby={undefined}
			>
				<DialogHeader className="flex-row items-start gap-2 p-4 pb-0 pr-12 space-y-0">
					<div className="flex-1">
						<DialogTitle className="sr-only">New automation</DialogTitle>
						<input
							type="text"
							placeholder="Automation title"
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="w-full bg-transparent border-none outline-none p-0 text-base font-medium placeholder:text-muted-foreground focus:outline-none"
						/>
					</div>
					<Button variant="outline" size="sm">
						Use template
					</Button>
				</DialogHeader>

				<div className="px-4 pt-2 h-[260px] flex flex-col overflow-y-auto">
					<MarkdownEditor
						content={prompt}
						onChange={setPrompt}
						placeholder="Add prompt e.g. look for crashes in $sentry"
						className="flex-1"
						editorClassName="min-h-[200px]"
					/>

					{createMutation.isError && (
						<p className="text-destructive text-sm mt-2">
							{createMutation.error instanceof Error
								? createMutation.error.message
								: "Failed to create automation"}
						</p>
					)}
				</div>

				<DialogFooter className="flex-row items-center justify-between gap-2 border-t p-3 sm:justify-between">
					<div className="flex items-center gap-2">
						<DevicePicker
							className="w-[160px]"
							hostTarget={hostTarget}
							onSelectHostTarget={setHostTarget}
						/>
						<ProjectPicker
							className="w-[120px]"
							selectedProject={selectedProject}
							recentProjects={recentProjects}
							onSelectProject={setSelectedProjectId}
						/>
						<SchedulePicker
							className="w-[164px]"
							scheduleKey={scheduleKey}
							onScheduleKeyChange={setScheduleKey}
							customRrule={customRrule}
							onCustomRruleChange={setCustomRrule}
							label={selectedScheduleLabel}
						/>
						<AgentPicker
							className="w-[130px]"
							value={agentType}
							onChange={setAgentType}
						/>
					</div>

					<div className="flex items-center gap-2">
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button
							disabled={!canSubmit}
							onClick={() => createMutation.mutate()}
						>
							{createMutation.isPending ? "Creating…" : "Create"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
