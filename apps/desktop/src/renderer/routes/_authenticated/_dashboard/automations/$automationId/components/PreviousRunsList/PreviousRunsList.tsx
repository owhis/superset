import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";

type AutomationRun = RouterOutputs["automation"]["get"]["recentRuns"][number];

const STATUS_VARIANT: Record<
	AutomationRun["status"],
	"default" | "secondary" | "destructive" | "outline"
> = {
	dispatched: "default",
	dispatching: "default",
	pending: "secondary",
	skipped_offline: "secondary",
	dispatch_failed: "destructive",
};

interface PreviousRunsListProps {
	runs: AutomationRun[];
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	if (runs.length === 0) {
		return <p className="text-sm italic text-muted-foreground">No runs yet</p>;
	}

	return (
		<ul className="flex flex-col gap-3 text-xs">
			{runs.map((run) => (
				<li key={run.id} className="flex flex-col gap-1">
					<div className="flex items-center justify-between gap-2">
						<span>
							{run.scheduledFor
								? new Date(run.scheduledFor).toLocaleString()
								: "—"}
						</span>
						<Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>
							{run.status}
						</Badge>
					</div>
					{run.error && (
						<span className="text-muted-foreground">{run.error}</span>
					)}
				</li>
			))}
		</ul>
	);
}
