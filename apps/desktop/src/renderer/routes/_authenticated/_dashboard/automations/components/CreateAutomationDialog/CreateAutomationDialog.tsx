import { BUILTIN_AGENT_DEFINITIONS } from "@superset/shared/agent-catalog";
import { Button } from "@superset/ui/button";
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
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	LuChevronDown,
	LuClock,
	LuCpu,
	LuFolder,
	LuInfo,
} from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	FullScreenModal,
	FullScreenModalBody,
	FullScreenModalClose,
	FullScreenModalContent,
	FullScreenModalFooter,
	FullScreenModalHeader,
	FullScreenModalTitle,
} from "../FullScreenModal";

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

export function CreateAutomationDialog({
	open,
	onOpenChange,
	onCreated,
}: CreateAutomationDialogProps) {
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [projectId, setProjectId] = useState("");
	const [agentType, setAgentType] = useState("claude");
	const defaultScheduleKey = SCHEDULE_PRESETS[0]?.key ?? CUSTOM_KEY;
	const [scheduleKey, setScheduleKey] = useState(defaultScheduleKey);
	const [customRrule, setCustomRrule] = useState("");

	useEffect(() => {
		if (!open) {
			setName("");
			setPrompt("");
			setProjectId("");
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

	const createMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.create.mutate({
				name,
				prompt,
				agentType,
				targetHostId: null,
				workspaceMode: "new_per_run",
				v2ProjectId: projectId || null,
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
		projectId.trim().length > 0 &&
		selectedRrule.length > 0 &&
		!createMutation.isPending;

	return (
		<FullScreenModal open={open} onOpenChange={onOpenChange}>
			<FullScreenModalContent aria-describedby={undefined}>
				<FullScreenModalHeader>
					<FullScreenModalTitle className="sr-only">
						New automation
					</FullScreenModalTitle>
					<Button variant="ghost" size="icon" disabled>
						<LuInfo className="size-4" />
					</Button>
					<Button variant="outline" size="sm" className="rounded-full">
						Use template
					</Button>
				</FullScreenModalHeader>

				<FullScreenModalBody>
					<Input
						placeholder="Automation title"
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="border-0 bg-transparent px-0 !text-2xl font-medium focus-visible:ring-0 focus-visible:border-0 md:!text-2xl"
					/>
					<Textarea
						placeholder="Add prompt e.g. look for crashes in $sentry"
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						className="flex-1 min-h-[240px] border-0 bg-transparent px-0 resize-none focus-visible:ring-0"
					/>

					{createMutation.isError && (
						<p className="text-destructive text-sm">
							{createMutation.error instanceof Error
								? createMutation.error.message
								: "Failed to create automation"}
						</p>
					)}
				</FullScreenModalBody>

				<FullScreenModalFooter>
					<ChipPopoverFolder projectId={projectId} onChange={setProjectId} />

					<AgentPicker
						value={agentType}
						onChange={setAgentType}
						label={selectedAgentLabel}
					/>

					<SchedulePicker
						scheduleKey={scheduleKey}
						onScheduleKeyChange={setScheduleKey}
						customRrule={customRrule}
						onCustomRruleChange={setCustomRrule}
						label={selectedScheduleLabel}
					/>

					<div className="flex-1" />

					<FullScreenModalClose asChild>
						<Button variant="ghost">Cancel</Button>
					</FullScreenModalClose>
					<Button
						disabled={!canSubmit}
						onClick={() => createMutation.mutate()}
						className="rounded-full"
					>
						{createMutation.isPending ? "Creating…" : "Create"}
					</Button>
				</FullScreenModalFooter>
			</FullScreenModalContent>
		</FullScreenModal>
	);
}

function ChipPopoverFolder({
	projectId,
	onChange,
}: {
	projectId: string;
	onChange: (value: string) => void;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" className="gap-2 font-normal">
					<LuFolder className="size-4" />
					{projectId ? `${projectId.slice(0, 8)}…` : "Select project"}
					<LuChevronDown className="size-3 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80" align="start">
				<div className="flex flex-col gap-2">
					<p className="text-xs text-muted-foreground">
						Paste the v2 project id (uuid). The dispatcher creates a fresh
						workspace inside this project for every run.
					</p>
					<Input
						autoFocus
						placeholder="00000000-0000-0000-0000-000000000000"
						className="font-mono text-xs"
						value={projectId}
						onChange={(event) => onChange(event.target.value)}
					/>
				</div>
			</PopoverContent>
		</Popover>
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
			<SelectTrigger className="h-8 gap-2 border-0 bg-secondary">
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
