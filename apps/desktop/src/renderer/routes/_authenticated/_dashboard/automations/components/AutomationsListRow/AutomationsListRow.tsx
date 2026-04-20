import type { SelectAutomation } from "@superset/db/schema";
import { describeSchedule } from "@superset/shared/rrule";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";

interface AutomationsListRowProps {
	automation: SelectAutomation;
	onClick: () => void;
}

export function AutomationsListRow({
	automation,
	onClick,
}: AutomationsListRowProps) {
	const scheduleText = describeSchedule(automation.rrule);
	return (
		<button
			type="button"
			onClick={onClick}
			className="group grid w-full grid-cols-[16px_1fr_auto_auto] items-center gap-4 py-4 text-left transition-colors hover:bg-accent/40 px-2 -mx-2 rounded-md"
		>
			<span
				className={cn(
					"inline-block size-2 rounded-full",
					automation.enabled
						? "bg-emerald-500"
						: "border border-muted-foreground/60",
				)}
			/>
			<span
				className={cn(
					"text-sm font-medium",
					!automation.enabled && "text-muted-foreground",
				)}
			>
				{automation.name}
				{!automation.enabled && (
					<Badge variant="secondary" className="ml-2 text-[10px]">
						paused
					</Badge>
				)}
			</span>
			<span className="text-sm text-muted-foreground">
				{automation.agentConfig.label}
			</span>
			<span className="text-sm text-muted-foreground">{scheduleText}</span>
		</button>
	);
}
