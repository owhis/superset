import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { DashboardSidebarProjectBackingState } from "../../../../types";

// Per state → short label shown in the row + longer tooltip copy.
// "normal" is handled by returning null — no indicator when the project is
// fully backed.
const STATE_META: Record<
	Exclude<DashboardSidebarProjectBackingState, "normal">,
	{ label: string; tooltip: string; dotClass: string; textClass: string }
> = {
	"host-offline": {
		label: "Offline",
		tooltip: "This project is backed on a host that's currently offline.",
		dotClass: "bg-muted-foreground/60",
		textClass: "text-muted-foreground",
	},
	"not-set-up-here": {
		label: "Not here",
		tooltip: "This project isn't set up on this device yet.",
		dotClass: "bg-amber-500",
		textClass: "text-amber-600 dark:text-amber-400",
	},
};

interface ProjectBackingStateIndicatorProps {
	state: DashboardSidebarProjectBackingState;
	/** Compact variant for the collapsed sidebar — dot only, no label. */
	variant?: "default" | "dot-only";
	className?: string;
}

export function ProjectBackingStateIndicator({
	state,
	variant = "default",
	className,
}: ProjectBackingStateIndicatorProps) {
	if (state === "normal") return null;
	const meta = STATE_META[state];

	if (variant === "dot-only") {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<span
						className={cn(
							"size-1.5 rounded-full ring-1 ring-background",
							meta.dotClass,
							className,
						)}
					/>
				</TooltipTrigger>
				<TooltipContent side="right">{meta.tooltip}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"shrink-0 inline-flex items-center gap-1 text-[11px] font-normal",
						meta.textClass,
						className,
					)}
				>
					<span
						className={cn("size-1.5 rounded-full", meta.dotClass)}
						aria-hidden
					/>
					{meta.label}
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">{meta.tooltip}</TooltipContent>
		</Tooltip>
	);
}
