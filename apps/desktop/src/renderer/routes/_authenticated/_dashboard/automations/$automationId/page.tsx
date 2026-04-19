import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { AutomationDetailHeader } from "./components/AutomationDetailHeader";
import { AutomationDetailSidebar } from "./components/AutomationDetailSidebar";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
});

const RECENT_RUNS_LIMIT = 10;

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();

	const { data: automationRows } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.where(({ a }) => eq(a.id, automationId))
				.select(({ a }) => ({ ...a })),
		[collections.automations, automationId],
	);
	const automation = automationRows?.[0] as SelectAutomation | undefined;

	const { data: runRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ r: collections.automationRuns })
				.where(({ r }) => eq(r.automationId, automationId))
				.orderBy(({ r }) => r.createdAt, "desc")
				.limit(RECENT_RUNS_LIMIT)
				.select(({ r }) => ({ ...r })),
		[collections.automationRuns, automationId],
	);
	const recentRuns = runRows as SelectAutomationRun[];

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.delete.mutate({ id: automationId }),
		onSuccess: () => navigate({ to: "/automations" }),
	});

	if (!automation) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Automation not found.
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<AutomationDetailHeader
					name={automation.name}
					enabled={automation.enabled}
					onBack={() => navigate({ to: "/automations" })}
					onToggleEnabled={() => setEnabledMutation.mutate(!automation.enabled)}
					onDelete={() => {
						if (
							confirm(
								`Delete "${automation.name}"? This removes the automation and its run history.`,
							)
						) {
							deleteMutation.mutate();
						}
					}}
					onRunNow={() => runNowMutation.mutate()}
					toggleDisabled={setEnabledMutation.isPending}
					deleteDisabled={deleteMutation.isPending}
					runNowDisabled={runNowMutation.isPending || !automation.enabled}
				/>

				<div className="flex-1 overflow-y-auto px-8 py-6">
					<h1 className="mb-6 text-2xl font-semibold">{automation.name}</h1>
					<pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
						{automation.prompt}
					</pre>
				</div>
			</div>

			<AutomationDetailSidebar
				automation={automation}
				recentRuns={recentRuns}
			/>
		</div>
	);
}
