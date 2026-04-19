import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import { LuPause, LuPlay, LuTrash2 } from "react-icons/lu";

interface AutomationDetailHeaderProps {
	name: string;
	enabled: boolean;
	onBack: () => void;
	onToggleEnabled: () => void;
	onDelete: () => void;
	onRunNow: () => void;
	toggleDisabled?: boolean;
	deleteDisabled?: boolean;
	runNowDisabled?: boolean;
}

export function AutomationDetailHeader({
	name,
	enabled,
	onBack,
	onToggleEnabled,
	onDelete,
	onRunNow,
	toggleDisabled,
	deleteDisabled,
	runNowDisabled,
}: AutomationDetailHeaderProps) {
	return (
		<header className="flex items-center justify-between border-b px-8 py-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink onClick={onBack} className="cursor-pointer">
							Automations
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={onToggleEnabled}
					disabled={toggleDisabled}
				>
					{enabled ? (
						<LuPause className="size-4" />
					) : (
						<LuPlay className="size-4" />
					)}
					{enabled ? "Pause" : "Resume"}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onDelete}
					disabled={deleteDisabled}
				>
					<LuTrash2 className="size-4" />
				</Button>
				<Button size="sm" onClick={onRunNow} disabled={runNowDisabled}>
					<LuPlay className="size-4" />
					Run now
				</Button>
			</div>
		</header>
	);
}
