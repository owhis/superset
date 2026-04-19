import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";

export type AutomationListItem = RouterOutputs["automation"]["list"][number];

interface AutomationsListRowProps {
	automation: AutomationListItem;
	onClick: () => void;
}

export function AutomationsListRow({
	automation,
	onClick,
}: AutomationsListRowProps) {
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
				{automation.agentType}
			</span>
			<span className="text-sm text-muted-foreground">
				{automation.scheduleText ?? automation.rrule}
			</span>
		</button>
	);
}
