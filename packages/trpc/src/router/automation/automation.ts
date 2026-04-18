import { db, dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { paidPlanProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { describeRrule, nextOccurrences, parseRrule } from "./rrule";
import {
	createAutomationSchema,
	listRunsSchema,
	parseRruleSchema,
	updateAutomationSchema,
} from "./schema";

async function verifyHostAccess(
	userId: string,
	organizationId: string,
	hostId: string,
): Promise<void> {
	const [host] = await db
		.select({ id: v2Hosts.id, organizationId: v2Hosts.organizationId })
		.from(v2Hosts)
		.where(eq(v2Hosts.id, hostId))
		.limit(1);

	if (!host || host.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Host not found",
		});
	}

	const [membership] = await db
		.select({ id: v2UsersHosts.id })
		.from(v2UsersHosts)
		.where(
			and(eq(v2UsersHosts.userId, userId), eq(v2UsersHosts.hostId, hostId)),
		)
		.limit(1);

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have access to this host",
		});
	}
}

async function verifyWorkspaceInOrg(
	organizationId: string,
	workspaceId: string,
): Promise<void> {
	const [workspace] = await db
		.select({
			id: v2Workspaces.id,
			organizationId: v2Workspaces.organizationId,
		})
		.from(v2Workspaces)
		.where(eq(v2Workspaces.id, workspaceId))
		.limit(1);

	if (!workspace || workspace.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}
}

async function getAutomationForUser(
	userId: string,
	organizationId: string,
	id: string,
) {
	const [automation] = await db
		.select()
		.from(automations)
		.where(
			and(
				eq(automations.id, id),
				eq(automations.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!automation || automation.ownerUserId !== userId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Automation not found",
		});
	}

	return automation;
}

export const automationRouter = {
	/** List automations scoped to the caller's active organization. */
	list: paidPlanProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx.session);

		const rows = await db
			.select()
			.from(automations)
			.where(eq(automations.organizationId, organizationId))
			.orderBy(desc(automations.createdAt));

		return rows.map((row) => ({
			...row,
			scheduleText: safeDescribeRrule(row),
		}));
	}),

	/** Get one automation plus the last 10 runs. */
	get: paidPlanProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			const automation = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			const recentRuns = await db
				.select()
				.from(automationRuns)
				.where(eq(automationRuns.automationId, input.id))
				.orderBy(desc(automationRuns.createdAt))
				.limit(10);

			return {
				...automation,
				scheduleText: safeDescribeRrule(automation),
				recentRuns,
			};
		}),

	create: paidPlanProcedure
		.input(createAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);

			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			if (input.workspaceMode === "existing" && input.v2WorkspaceId) {
				await verifyWorkspaceInOrg(organizationId, input.v2WorkspaceId);
			}

			const dtstart = input.dtstart ?? new Date();
			const { nextRunAt } = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});

			const [created] = await dbWs
				.insert(automations)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					name: input.name,
					prompt: input.prompt,
					agentType: input.agentType,
					targetHostId: input.targetHostId ?? null,
					workspaceMode: input.workspaceMode,
					v2ProjectId: input.v2ProjectId ?? null,
					v2WorkspaceId: input.v2WorkspaceId ?? null,
					rrule: input.rrule,
					dtstart,
					timezone: input.timezone,
					mcpScope: input.mcpScope,
					nextRunAt,
				})
				.returning();

			return { ...created, scheduleText: safeDescribeRrule(created) };
		}),

	update: paidPlanProcedure
		.input(updateAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			if (input.targetHostId !== undefined && input.targetHostId !== null) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			if (input.v2WorkspaceId) {
				await verifyWorkspaceInOrg(organizationId, input.v2WorkspaceId);
			}

			const nextRrule = input.rrule ?? existing.rrule;
			const nextDtstart = input.dtstart ?? existing.dtstart;
			const nextTimezone = input.timezone ?? existing.timezone;
			const recurrenceChanged =
				input.rrule !== undefined ||
				input.dtstart !== undefined ||
				input.timezone !== undefined;

			const recomputedNextRunAt = recurrenceChanged
				? parseRrule({
						rrule: nextRrule,
						dtstart: nextDtstart,
						timezone: nextTimezone,
					}).nextRunAt
				: existing.nextRunAt;

			const [updated] = await dbWs
				.update(automations)
				.set({
					name: input.name ?? existing.name,
					prompt: input.prompt ?? existing.prompt,
					agentType: input.agentType ?? existing.agentType,
					targetHostId:
						input.targetHostId === undefined
							? existing.targetHostId
							: input.targetHostId,
					workspaceMode: input.workspaceMode ?? existing.workspaceMode,
					v2ProjectId:
						input.v2ProjectId === undefined
							? existing.v2ProjectId
							: input.v2ProjectId,
					v2WorkspaceId:
						input.v2WorkspaceId === undefined
							? existing.v2WorkspaceId
							: input.v2WorkspaceId,
					rrule: nextRrule,
					dtstart: nextDtstart,
					timezone: nextTimezone,
					mcpScope: input.mcpScope ?? existing.mcpScope,
					nextRunAt: recomputedNextRunAt,
				})
				.where(eq(automations.id, input.id))
				.returning();

			return { ...updated, scheduleText: safeDescribeRrule(updated) };
		}),

	delete: paidPlanProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			await getAutomationForUser(ctx.session.user.id, organizationId, input.id);

			await dbWs.delete(automations).where(eq(automations.id, input.id));

			return { ok: true };
		}),

	setEnabled: paidPlanProcedure
		.input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			// When resuming, recompute next_run_at from now so we don't fire stale
			// occurrences that accumulated while paused.
			const patch: { enabled: boolean; nextRunAt?: Date } = {
				enabled: input.enabled,
			};
			if (input.enabled && !existing.enabled) {
				patch.nextRunAt = parseRrule({
					rrule: existing.rrule,
					dtstart: existing.dtstart,
					timezone: existing.timezone,
					after: new Date(),
				}).nextRunAt;
			}

			const [updated] = await dbWs
				.update(automations)
				.set(patch)
				.where(eq(automations.id, input.id))
				.returning();

			return { ...updated, scheduleText: safeDescribeRrule(updated) };
		}),

	/**
	 * Fire an automation immediately — inserts a scheduled_for = now() run and
	 * returns the row. Dispatch is picked up on the next cron tick, or the
	 * caller can hit the dispatcher directly with the returned id.
	 */
	runNow: paidPlanProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			const automation = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			const scheduledFor = bucketToMinute(new Date());

			const [run] = await dbWs
				.insert(automationRuns)
				.values({
					automationId: automation.id,
					organizationId: automation.organizationId,
					scheduledFor,
					status: "pending",
				})
				.onConflictDoNothing({
					target: [automationRuns.automationId, automationRuns.scheduledFor],
				})
				.returning();

			if (!run) {
				// There's already a run for this minute bucket — fetch + return it.
				const [existingRun] = await db
					.select()
					.from(automationRuns)
					.where(
						and(
							eq(automationRuns.automationId, automation.id),
							eq(automationRuns.scheduledFor, scheduledFor),
						),
					)
					.limit(1);
				return existingRun;
			}

			return run;
		}),

	/** Run history for a given automation (paginated). */
	listRuns: paidPlanProcedure
		.input(listRunsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.automationId,
			);

			return db
				.select()
				.from(automationRuns)
				.where(eq(automationRuns.automationId, input.automationId))
				.orderBy(desc(automationRuns.createdAt))
				.limit(input.limit);
		}),

	/** Validate an RRule body + preview its next occurrences. */
	validateRrule: paidPlanProcedure
		.input(parseRruleSchema)
		.mutation(async ({ input }) => {
			const dtstart = input.dtstart ?? new Date();
			const { nextRunAt } = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});
			return {
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
				scheduleText: describeRrule({
					rrule: input.rrule,
					dtstart,
					timezone: input.timezone,
				}),
				nextRunAt,
				nextRuns: nextOccurrences({
					rrule: input.rrule,
					dtstart,
					timezone: input.timezone,
					count: 5,
				}),
			};
		}),
} satisfies TRPCRouterRecord;

/**
 * Floors a Date down to the minute so two dispatches in the same minute bucket
 * collide on the unique index.
 */
function bucketToMinute(date: Date): Date {
	const copy = new Date(date.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

interface RecurrenceSource {
	rrule: string;
	dtstart: Date;
	timezone: string;
}

function safeDescribeRrule(row: RecurrenceSource | null | undefined): string {
	if (!row) return "";
	try {
		return describeRrule({
			rrule: row.rrule,
			dtstart: row.dtstart,
			timezone: row.timezone,
		});
	} catch {
		return row.rrule;
	}
}

export { bucketToMinute };
