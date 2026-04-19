import { BUILTIN_AGENT_DEFINITIONS } from "@superset/shared/agent-catalog";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LuChevronDown, LuClock, LuCpu, LuInfo } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/types";
import { ProjectPickerPill } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/components/ProjectPickerPill";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export type AutomationCreatedPayload = { id: string; name: string };

interface CreateAutomationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (automation: AutomationCreatedPayload) => void;
}

interface SchedulePreset {
	key: string;
	label: string;
	rrule: string;
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
	{
		key: "daily-9",
		label: "Daily at 9:00 AM",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "weekdays-9",
		label: "Weekdays at 9:00 AM",
		rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "weekly-mo",
		label: "Weekly on Monday 9:00 AM",
		rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "monthly-1",
		label: "Monthly on the 1st 9:00 AM",
		rrule: "FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "every-2m",
		label: "Every 2 minutes (smoke test)",
		rrule: "FREQ=MINUTELY;INTERVAL=2",
	},
];

const CUSTOM_KEY = "__custom__";
const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function useRecentProjects(): ProjectOption[] {
	const collections = useCollections();

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.select(({ projects }) => ({ ...projects })),
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

	return useMemo(() => {
		const repoById = new Map(
			(githubRepositories ?? []).map((repo) => [repo.id, repo]),
		);
		return (v2Projects ?? []).map((project) => {
			const repo = project.githubRepositoryId
				? (repoById.get(project.githubRepositoryId) ?? null)
				: null;
			return {
				id: project.id,
				name: project.name,
				githubOwner: repo?.owner ?? null,
				githubRepoName: repo?.name ?? null,
			};
		});
	}, [githubRepositories, v2Projects]);
}

export function CreateAutomationDialog({
	open,
	onOpenChange,
	onCreated,
}: CreateAutomationDialogProps) {
	const defaultScheduleKey = SCHEDULE_PRESETS[0]?.key ?? CUSTOM_KEY;
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

	const isCustom = scheduleKey === CUSTOM_KEY;
	const selectedPreset = SCHEDULE_PRESETS.find((p) => p.key === scheduleKey);
	const selectedRrule = isCustom
		? customRrule.trim()
		: (selectedPreset?.rrule ?? "");
	const selectedScheduleLabel = isCustom
		? customRrule
			? "Custom"
			: "Choose schedule"
		: (selectedPreset?.label ?? "Choose schedule");
	const selectedAgentLabel =
		BUILTIN_AGENT_DEFINITIONS.find((a) => a.id === agentType)?.label ??
		agentType;

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
				<DialogHeader className="flex-row items-start gap-2 p-4 pb-0 space-y-0">
					<div className="flex-1">
						<DialogTitle className="sr-only">New automation</DialogTitle>
						<Input
							placeholder="Automation title"
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="border-0 bg-transparent px-0 h-8 text-base font-medium shadow-none focus-visible:ring-0"
						/>
					</div>
					<Button variant="ghost" size="icon" disabled>
						<LuInfo className="size-4" />
					</Button>
					<Button variant="outline" size="sm" className="rounded-full">
						Use template
					</Button>
				</DialogHeader>

				<div className="px-4 pt-2 h-[260px] flex flex-col">
					<Textarea
						placeholder="Add prompt e.g. look for crashes in $sentry"
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						className="flex-1 border-0 bg-transparent px-0 resize-none shadow-none focus-visible:ring-0"
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
							hostTarget={hostTarget}
							onSelectHostTarget={setHostTarget}
						/>
						<ProjectPickerPill
							selectedProject={selectedProject}
							recentProjects={recentProjects}
							onSelectProject={setSelectedProjectId}
						/>
						<SchedulePicker
							scheduleKey={scheduleKey}
							onScheduleKeyChange={setScheduleKey}
							customRrule={customRrule}
							onCustomRruleChange={setCustomRrule}
							label={selectedScheduleLabel}
						/>
						<AgentPicker
							value={agentType}
							onChange={setAgentType}
							label={selectedAgentLabel}
						/>
					</div>

					<div className="flex items-center gap-2">
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button
							disabled={!canSubmit}
							onClick={() => createMutation.mutate()}
							className="rounded-full"
						>
							{createMutation.isPending ? "Creating…" : "Create"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AgentPicker({
	value,
	onChange,
	label,
}: {
	value: string;
	onChange: (next: string) => void;
	label: string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger size="sm" className="gap-2 border-0 bg-secondary h-8">
				<LuCpu className="size-4" />
				<SelectValue placeholder="Agent">{label}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{BUILTIN_AGENT_DEFINITIONS.map((agent) => (
					<SelectItem key={agent.id} value={agent.id}>
						{agent.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function SchedulePicker({
	scheduleKey,
	onScheduleKeyChange,
	customRrule,
	onCustomRruleChange,
	label,
}: {
	scheduleKey: string;
	onScheduleKeyChange: (key: string) => void;
	customRrule: string;
	onCustomRruleChange: (rrule: string) => void;
	label: string;
}) {
	const isCustom = scheduleKey === CUSTOM_KEY;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" className="gap-2 font-normal">
					<LuClock className="size-4" />
					{label}
					<LuChevronDown className="size-3 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80" align="start">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						{SCHEDULE_PRESETS.map((preset) => (
							<button
								type="button"
								key={preset.key}
								onClick={() => onScheduleKeyChange(preset.key)}
								className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
							>
								<span>{preset.label}</span>
								{scheduleKey === preset.key && (
									<span className="text-xs text-muted-foreground">✓</span>
								)}
							</button>
						))}
						<button
							type="button"
							onClick={() => onScheduleKeyChange(CUSTOM_KEY)}
							className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
						>
							<span>Custom RRule…</span>
							{isCustom && (
								<span className="text-xs text-muted-foreground">✓</span>
							)}
						</button>
					</div>
					{isCustom && (
						<Input
							autoFocus
							placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
							className="font-mono text-xs"
							value={customRrule}
							onChange={(event) => onCustomRruleChange(event.target.value)}
						/>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
