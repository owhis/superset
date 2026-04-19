import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { LuClock, LuPlus } from "react-icons/lu";

interface AutomationsEmptyStateProps {
	onCreate: () => void;
}

export function AutomationsEmptyState({
	onCreate,
}: AutomationsEmptyStateProps) {
	return (
		<Empty className="border-0">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<LuClock className="size-6" />
				</EmptyMedia>
				<EmptyTitle>No automations yet</EmptyTitle>
				<EmptyDescription>
					Schedule a Claude session to run on your machine — standups, release
					notes, nightly audits.
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button type="button" onClick={onCreate}>
					<LuPlus className="size-4" />
					New automation
				</Button>
			</EmptyContent>
		</Empty>
	);
}
