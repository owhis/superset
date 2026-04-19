import type { SelectAutomation } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { AutomationsListRow } from "./components/AutomationsListRow";
import { CreateAutomationDialog } from "./components/CreateAutomationDialog";
import type { AutomationTemplate } from "./templates";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

function AutomationsPage() {
	const navigate = useNavigate();
	const collections = useCollections();
	const [createOpen, setCreateOpen] = useState(false);
	const [initialTemplate, setInitialTemplate] =
		useState<AutomationTemplate | null>(null);

	const { data: sortedAutomations = [] } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.orderBy(({ a }) => a.createdAt, "desc")
				.select(({ a }) => ({ ...a })),
		[collections.automations],
	);

	const handleSelectTemplate = (template: AutomationTemplate) => {
		setInitialTemplate(template);
		setCreateOpen(true);
	};

	const handleDialogOpenChange = (next: boolean) => {
		setCreateOpen(next);
		if (!next) setInitialTemplate(null);
	};

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex items-start justify-between border-b px-8 py-6">
				<div>
					<h1 className="text-2xl font-semibold">Automations</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Run agents on a schedule to automate work.{" "}
						<Button
							asChild
							variant="link"
							size="sm"
							className="p-0 h-auto align-baseline"
						>
							<a
								href={`${COMPANY.DOCS_URL}/automations`}
								target="_blank"
								rel="noreferrer"
							>
								Learn more
							</a>
						</Button>
					</p>
				</div>
				<Button type="button" onClick={() => setCreateOpen(true)}>
					<LuPlus className="size-4" />
					New automation
				</Button>
			</header>

			<div className="flex-1 overflow-y-auto px-8 py-6">
				{sortedAutomations.length === 0 ? (
					<AutomationsEmptyState onSelectTemplate={handleSelectTemplate} />
				) : (
					<div className="mx-auto max-w-4xl">
						<h2 className="mb-3 text-sm font-medium">Current</h2>
						<Separator />
						{sortedAutomations.map((automation, index) => (
							<Fragment key={automation.id}>
								<AutomationsListRow
									automation={automation as SelectAutomation}
									onClick={() =>
										navigate({
											to: "/automations/$automationId",
											params: { automationId: automation.id },
										})
									}
								/>
								{index < sortedAutomations.length - 1 && <Separator />}
							</Fragment>
						))}
					</div>
				)}
			</div>

			<CreateAutomationDialog
				open={createOpen}
				onOpenChange={handleDialogOpenChange}
				initialTemplate={initialTemplate}
				onCreated={() => handleDialogOpenChange(false)}
			/>
		</div>
	);
}
