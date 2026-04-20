import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useProjectFileSearch } from "../components/CreateAutomationDialog/hooks/useProjectFileSearch";
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
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
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
					runNowDisabled={runNowMutation.isPending}
				/>

				<AutomationBody key={automation.id} automation={automation} />
			</div>

			<AutomationDetailSidebar
				automation={automation}
				recentRuns={recentRuns}
			/>
		</div>
	);
}

function AutomationBody({ automation }: { automation: SelectAutomation }) {
	const [name, setName] = useState(automation.name);
	const [prompt, setPrompt] = useState(automation.prompt);

	const updateMutation = useMutation({
		mutationFn: (patch: { name?: string; prompt?: string }) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
	});

	const hostTarget: WorkspaceHostTarget = automation.targetHostId
		? { kind: "host", hostId: automation.targetHostId }
		: { kind: "local" };
	const searchFiles = useProjectFileSearch({
		hostTarget,
		projectId: automation.v2ProjectId,
	});

	return (
		<div className="flex-1 overflow-y-auto px-8 py-6">
			<EmojiTextInput
				value={name}
				onChange={setName}
				onBlur={(next) => {
					const trimmed = next.trim();
					if (trimmed && trimmed !== automation.name) {
						updateMutation.mutate({ name: trimmed });
					}
				}}
				placeholder="Automation title"
				className="mb-6 text-2xl font-semibold"
			/>
			<MarkdownEditor
				content={prompt}
				onChange={setPrompt}
				onSave={(next) => {
					if (next !== automation.prompt) {
						updateMutation.mutate({ prompt: next });
					}
				}}
				placeholder="Add prompt e.g. look for crashes in $sentry"
				searchFiles={searchFiles}
			/>
		</div>
	);
}
