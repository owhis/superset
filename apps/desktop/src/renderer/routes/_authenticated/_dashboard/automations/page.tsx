import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Separator } from "@superset/ui/separator";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { LuClock, LuPlus } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
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
				<Button
					type="button"
					onClick={() => setCreateOpen(true)}
					className="rounded-full"
				>
					<LuPlus className="size-4" />
					New automation
				</Button>
			</header>

			<div className="flex-1 overflow-y-auto px-8 py-6">
				{isPending ? (
					<div className="flex h-full items-center justify-center">
						<Spinner className="size-5" />
					</div>
				) : !data || data.length === 0 ? (
					<Empty className="border-0">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<LuClock className="size-6" />
							</EmptyMedia>
							<EmptyTitle>No automations yet</EmptyTitle>
							<EmptyDescription>
								Schedule a Claude session to run on your machine — standups,
								release notes, nightly audits.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button
								type="button"
								onClick={() => setCreateOpen(true)}
								className="rounded-full"
							>
								<LuPlus className="size-4" />
								New automation
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<div className="mx-auto max-w-4xl">
						<h2 className="mb-3 text-sm font-medium">Current</h2>
						<Separator />
						{data.map((automation, index) => (
							<Fragment key={automation.id}>
								<AutomationRow
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

interface AutomationRow {
	id: string;
	name: string;
	enabled: boolean;
	agentType: string;
	scheduleText?: string | null;
	rrule: string;
}

function AutomationRow({
	automation,
	onClick,
}: {
	automation: AutomationRow;
	onClick: () => void;
}) {
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
