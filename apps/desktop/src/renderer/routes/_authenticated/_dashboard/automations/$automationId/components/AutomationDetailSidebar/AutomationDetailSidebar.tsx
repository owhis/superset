import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { describeSchedule } from "@superset/shared/schedule-text";
import { Badge } from "@superset/ui/badge";
import { Separator } from "@superset/ui/separator";
import type { ReactNode } from "react";
import { PreviousRunsList } from "../PreviousRunsList";

interface AutomationDetailSidebarProps {
	automation: SelectAutomation;
	recentRuns: SelectAutomationRun[];
}

export function AutomationDetailSidebar({
	automation,
	recentRuns,
}: AutomationDetailSidebarProps) {
	const scheduleText = describeSchedule(automation.rrule);

	return (
		<aside className="w-72 shrink-0 border-l overflow-y-auto">
			<div className="flex flex-col gap-6 p-6">
				<Section title="Status">
					<Row
						label="Status"
						value={
							<Badge variant={automation.enabled ? "default" : "secondary"}>
								● {automation.enabled ? "Active" : "Paused"}
							</Badge>
						}
					/>
					<Row
						label="Next run"
						value={
							automation.enabled && automation.nextRunAt
								? new Date(automation.nextRunAt).toLocaleString()
								: "—"
						}
					/>
					<Row
						label="Last ran"
						value={
							automation.lastRunAt
								? new Date(automation.lastRunAt).toLocaleString()
								: "—"
						}
					/>
				</Section>

				<Separator />

				<Section title="Details">
					<Row
						label="Workspace"
						value={
							automation.workspaceMode === "new_per_run"
								? "New workspace"
								: "Existing"
						}
					/>
					<Row label="Repeats" value={scheduleText} />
					<Row label="Agent" value={automation.agentConfig.label} />
					<Row label="Timezone" value={automation.timezone} />
				</Section>

				<Separator />

				<Section title="Previous runs">
					<PreviousRunsList runs={recentRuns} />
				</Section>
			</div>
		</aside>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{title}
			</h4>
			{children}
		</section>
	);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate text-right">{value}</span>
		</div>
	);
}
