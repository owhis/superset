import { LinearClient } from "@linear/sdk";
import type { EntityWebhookPayloadWithIssueData } from "@linear/sdk/webhooks";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import { members, taskStatuses, tasks, users } from "@superset/db/schema";
import { mapPriorityFromLinear } from "@superset/trpc/integrations/linear";
import { and, eq } from "drizzle-orm";
import { syncWorkflowStates } from "../jobs/initial-sync/syncWorkflowStates";

type ResolveStatusDeps = {
	syncWorkflowStates: typeof syncWorkflowStates;
	createClient: (accessToken: string) => LinearClient;
};

const defaultDeps: ResolveStatusDeps = {
	syncWorkflowStates,
	createClient: (accessToken) => new LinearClient({ accessToken }),
};

async function findTaskStatus(organizationId: string, externalStateId: string) {
	return db.query.taskStatuses.findFirst({
		where: and(
			eq(taskStatuses.organizationId, organizationId),
			eq(taskStatuses.externalProvider, "linear"),
			eq(taskStatuses.externalId, externalStateId),
		),
	});
}

export async function processIssueEvent(
	payload: EntityWebhookPayloadWithIssueData,
	connection: SelectIntegrationConnection,
	deps: ResolveStatusDeps = defaultDeps,
): Promise<"processed" | "skipped"> {
	const issue = payload.data;

	if (payload.action === "create" || payload.action === "update") {
		let taskStatus = await findTaskStatus(
			connection.organizationId,
			issue.state.id,
		);

		if (!taskStatus) {
			// Linear may introduce new workflow states after the initial sync. When a
			// webhook references an unknown state, refresh states from Linear and
			// retry before giving up, otherwise tasks created against new states
			// never reach Superset.
			console.warn(
				`[webhook] Status not found for state ${issue.state.id}, resyncing workflow states`,
			);
			const client = deps.createClient(connection.accessToken);
			await deps.syncWorkflowStates({
				client,
				organizationId: connection.organizationId,
			});

			taskStatus = await findTaskStatus(
				connection.organizationId,
				issue.state.id,
			);

			if (!taskStatus) {
				console.warn(
					`[webhook] Status still not found for state ${issue.state.id} after resync, skipping update`,
				);
				return "skipped";
			}
		}

		let assigneeId: string | null = null;
		if (issue.assignee?.email) {
			const matchedMember = await db
				.select({ userId: users.id })
				.from(users)
				.innerJoin(members, eq(members.userId, users.id))
				.where(
					and(
						eq(users.email, issue.assignee.email),
						eq(members.organizationId, connection.organizationId),
					),
				)
				.limit(1)
				.then((rows) => rows[0]);
			assigneeId = matchedMember?.userId ?? null;
		}

		let assigneeExternalId: string | null = null;
		let assigneeDisplayName: string | null = null;
		let assigneeAvatarUrl: string | null = null;

		if (issue.assignee && !assigneeId) {
			assigneeExternalId = issue.assignee.id;
			assigneeDisplayName = issue.assignee.name ?? null;
			assigneeAvatarUrl = issue.assignee.avatarUrl ?? null;
		}

		const taskData = {
			slug: issue.identifier,
			title: issue.title,
			description: issue.description ?? null,
			statusId: taskStatus.id,
			priority: mapPriorityFromLinear(issue.priority),
			assigneeId,
			assigneeExternalId,
			assigneeDisplayName,
			assigneeAvatarUrl,
			estimate: issue.estimate ?? null,
			dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
			labels: issue.labels.map((l) => l.name),
			startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
			completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
			externalProvider: "linear" as const,
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
			lastSyncedAt: new Date(),
		};

		await db
			.insert(tasks)
			.values({
				...taskData,
				organizationId: connection.organizationId,
				creatorId: connection.connectedByUserId,
				createdAt: new Date(issue.createdAt),
			})
			.onConflictDoUpdate({
				target: [
					tasks.organizationId,
					tasks.externalProvider,
					tasks.externalId,
				],
				set: { ...taskData, syncError: null },
			});
	} else if (payload.action === "remove") {
		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(tasks.externalProvider, "linear"),
					eq(tasks.externalId, issue.id),
				),
			);
	}

	return "processed";
}
