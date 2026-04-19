import type { SelectAutomationRun } from "@superset/db/schema";
import { Badge } from "@superset/ui/badge";

const STATUS_VARIANT: Record<
	SelectAutomationRun["status"],
	"default" | "secondary" | "destructive" | "outline"
> = {
	dispatched: "default",
	dispatching: "default",
	pending: "secondary",
	skipped_offline: "secondary",
	dispatch_failed: "destructive",
};

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
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
