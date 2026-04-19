import { Badge } from "@superset/ui/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";
import { Spinner } from "@superset/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LuPause, LuPlay, LuTrash2 } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
});

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	dispatched: "default",
	dispatching: "default",
	pending: "secondary",
	skipped_offline: "secondary",
	dispatch_failed: "destructive",
};

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["automations", "get", automationId],
		queryFn: () => apiTrpcClient.automation.get.query({ id: automationId }),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["automations"] });

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			apiTrpcClient.automation.setEnabled.mutate({ id: automationId, enabled }),
		onSuccess: invalidate,
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.runNow.mutate({ id: automationId }),
		onSuccess: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.automation.delete.mutate({ id: automationId }),
		onSuccess: () => {
			invalidate();
			navigate({ to: "/automations" });
		},
	});

	if (query.isPending) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (!query.data) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Automation not found.
			</div>
		);
	}

	const automation = query.data;

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<header className="flex items-center justify-between border-b px-8 py-4">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink
									onClick={() => navigate({ to: "/automations" })}
									className="cursor-pointer"
								>
									Automations
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>{automation.name}</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setEnabledMutation.mutate(!automation.enabled)}
							disabled={setEnabledMutation.isPending}
						>
							{automation.enabled ? (
								<LuPause className="size-4" />
							) : (
								<LuPlay className="size-4" />
							)}
							{automation.enabled ? "Pause" : "Resume"}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								if (
									confirm(
										`Delete "${automation.name}"? This removes the automation and its run history.`,
									)
								) {
									deleteMutation.mutate();
								}
							}}
							disabled={deleteMutation.isPending}
						>
							<LuTrash2 className="size-4" />
						</Button>
						<Button
							size="sm"
							onClick={() => runNowMutation.mutate()}
							disabled={runNowMutation.isPending || !automation.enabled}
						>
							<LuPlay className="size-4" />
							Run now
						</Button>
					</div>
				</header>

				<div className="flex-1 overflow-y-auto px-8 py-6">
					<h1 className="mb-6 text-2xl font-semibold">{automation.name}</h1>
					<pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
						{automation.prompt}
					</pre>
				</div>
			</div>

			<aside className="w-72 shrink-0 border-l overflow-y-auto">
				<div className="flex flex-col gap-6 p-6">
					<RailSection title="Status">
						<RailRow
							label="Status"
							value={
								<Badge variant={automation.enabled ? "default" : "secondary"}>
									● {automation.enabled ? "Active" : "Paused"}
								</Badge>
							}
						/>
						<RailRow
							label="Next run"
							value={
								automation.enabled && automation.nextRunAt
									? new Date(automation.nextRunAt).toLocaleString()
									: "—"
							}
						/>
						<RailRow
							label="Last ran"
							value={
								automation.lastRunAt
									? new Date(automation.lastRunAt).toLocaleString()
									: "—"
							}
						/>
					</RailSection>

					<Separator />

					<RailSection title="Details">
						<RailRow
							label="Workspace"
							value={
								automation.workspaceMode === "new_per_run"
									? "New workspace"
									: "Existing"
							}
						/>
						<RailRow
							label="Repeats"
							value={automation.scheduleText ?? automation.rrule}
						/>
						<RailRow label="Agent" value={automation.agentType} />
						<RailRow label="Timezone" value={automation.timezone} />
					</RailSection>

					<Separator />

					<RailSection title="Previous runs">
						{automation.recentRuns.length === 0 ? (
							<p className="text-sm italic text-muted-foreground">
								No runs yet
							</p>
						) : (
							<ul className="flex flex-col gap-3 text-xs">
								{automation.recentRuns.map((run) => (
									<li key={run.id} className="flex flex-col gap-1">
										<div className="flex items-center justify-between gap-2">
											<span>
												{run.scheduledFor
													? new Date(run.scheduledFor).toLocaleString()
													: "—"}
											</span>
											<Badge
												variant={STATUS_VARIANT[run.status] ?? "secondary"}
											>
												{run.status}
											</Badge>
										</div>
										{run.error && (
											<span className="text-muted-foreground">{run.error}</span>
										)}
									</li>
								))}
							</ul>
						)}
					</RailSection>
				</div>
			</aside>
		</div>
	);
}

function RailSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{title}
			</h4>
			{children}
		</section>
	);
}

function RailRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate text-right">{value}</span>
		</div>
	);
}
