import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { AutomationsListRow } from "./components/AutomationsListRow";
import { CreateAutomationDialog } from "./components/CreateAutomationDialog";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

function AutomationsPage() {
	const navigate = useNavigate();
	const [createOpen, setCreateOpen] = useState(false);

	const { data, isPending, refetch } = useQuery({
		queryKey: ["automations", "list"],
		queryFn: () => apiTrpcClient.automation.list.query(),
	});

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex items-start justify-between border-b px-8 py-6">
				<div>
					<h1 className="text-2xl font-semibold">Automations</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Automate work by setting up scheduled runs.
					</p>
				</div>
				<Button type="button" onClick={() => setCreateOpen(true)}>
					<LuPlus className="size-4" />
					New automation
				</Button>
			</header>

			<div className="flex-1 overflow-y-auto px-8 py-6">
				{isPending ? null : !data || data.length === 0 ? (
					<AutomationsEmptyState onCreate={() => setCreateOpen(true)} />
				) : (
					<div className="mx-auto max-w-4xl">
						<h2 className="mb-3 text-sm font-medium">Current</h2>
						<Separator />
						{data.map((automation, index) => (
							<Fragment key={automation.id}>
								<AutomationsListRow
									automation={automation}
									onClick={() =>
										navigate({
											to: "/automations/$automationId",
											params: { automationId: automation.id },
										})
									}
								/>
								{index < data.length - 1 && <Separator />}
							</Fragment>
						))}
					</div>
				)}
			</div>

			<CreateAutomationDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={() => {
					setCreateOpen(false);
					refetch();
				}}
			/>
		</div>
	);
}
