import crypto from "node:crypto";
import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	chatSessions,
	type SelectAutomation,
	users,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import {
	buildPromptCommandFromAgentConfig,
	getCommandFromAgentConfig,
	type TerminalResolvedAgentConfig,
} from "@superset/shared/agent-settings";
import {
	deduplicateBranchName,
	generateFriendlyBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { RRule } from "rrule";
import { env } from "@/env";
import { RelayDispatchError, relayMutation } from "./relay-client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DISPATCH_LOOKBACK_MINUTES = 5;
const DISPATCH_BATCH_SIZE = 1000;

function authorized(request: Request): boolean {
	const header = request.headers.get("authorization");
	return header === `Bearer ${env.CRON_SECRET}`;
}

function bucketToMinute(date: Date): Date {
	const copy = new Date(date.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

/**
 * Serializes a Date into the local wall-clock string RRule expects
 * (YYYYMMDDTHHMMSS) in a given IANA timezone.
 */
function formatRRuleLocalDtstart(dtstart: Date, timezone: string): string {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(dtstart).map((p) => [p.type, p.value]),
	);
	return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function advanceRrule(automation: SelectAutomation): Date | null {
	const rule = RRule.fromString(
		`DTSTART;TZID=${automation.timezone}:${formatRRuleLocalDtstart(
			automation.dtstart,
			automation.timezone,
		)}\nRRULE:${automation.rrule}`,
	);
	// Strictly after the occurrence we just fired to avoid re-firing on
	// clock skew between the dispatcher ticks.
	return rule.after(automation.nextRunAt, false);
}

async function advanceNextRun(
	automation: SelectAutomation,
	now: Date,
): Promise<void> {
	const next = advanceRrule(automation);
	if (next) {
		await dbWs
			.update(automations)
			.set({ nextRunAt: next, lastRunAt: now })
			.where(eq(automations.id, automation.id));
	} else {
		// RRule exhausted (UNTIL / COUNT). Disable the automation.
		await dbWs
			.update(automations)
			.set({ enabled: false, lastRunAt: now })
			.where(eq(automations.id, automation.id));
	}
}

async function resolveTargetHost(
	automation: SelectAutomation,
): Promise<typeof v2Hosts.$inferSelect | null> {
	if (automation.targetHostId) {
		const [host] = await dbWs
			.select()
			.from(v2Hosts)
			.where(eq(v2Hosts.id, automation.targetHostId))
			.limit(1);
		return host ?? null;
	}

	// Fallback: owner's most-recently-updated online host in this org.
	const [host] = await dbWs
		.select({
			id: v2Hosts.id,
			organizationId: v2Hosts.organizationId,
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			isOnline: v2Hosts.isOnline,
			createdByUserId: v2Hosts.createdByUserId,
			createdAt: v2Hosts.createdAt,
			updatedAt: v2Hosts.updatedAt,
		})
		.from(v2Hosts)
		.innerJoin(v2UsersHosts, eq(v2UsersHosts.hostId, v2Hosts.id))
		.where(
			and(
				eq(v2UsersHosts.userId, automation.ownerUserId),
				eq(v2Hosts.organizationId, automation.organizationId),
				eq(v2Hosts.isOnline, true),
			),
		)
		.orderBy(v2Hosts.updatedAt)
		.limit(1);

	return host ?? null;
}

async function recordSkipped(
	automation: SelectAutomation,
	scheduledFor: Date,
	hostId: string | null,
	error: string,
): Promise<void> {
	await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			scheduledFor,
			hostId,
			status: "skipped_offline",
			error,
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		});
}

interface WorkspaceCreateResult {
	workspaceId: string;
	branchName: string;
}

/**
 * Calls host-service workspaceCreation.create via the relay.
 *
 * Returns the id of the created v2_workspace.
 */
async function createWorkspaceOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	automation: SelectAutomation;
	runId: string;
}): Promise<WorkspaceCreateResult> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const baseSlug = slugifyForBranch(args.automation.name, 30);
	const friendly = generateFriendlyBranchName();
	const candidateBranch = sanitizeBranchNameWithMaxLength(
		baseSlug
			? `${baseSlug}-${timestamp.slice(0, 10)}-${friendly.split("-")[1] ?? friendly}`
			: `automation-${timestamp}`,
		60,
	);
	const branchName = deduplicateBranchName(candidateBranch, []);
	const workspaceName = args.automation.name.slice(0, 100);

	const result = await relayMutation<
		{
			pendingId: string;
			projectId: string;
			names: { workspaceName: string; branchName: string };
			composer: { prompt?: string; runSetupScript?: boolean };
		},
		{
			workspace: { id: string };
			terminals: unknown[];
			warnings: string[];
		}
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
		},
		"workspaceCreation.create",
		{
			pendingId: args.runId,
			projectId: args.projectId,
			names: { workspaceName, branchName },
			composer: {
				prompt: args.automation.prompt,
				runSetupScript: false,
			},
		},
	);

	return { workspaceId: result.workspace.id, branchName };
}

async function dispatchChatSession(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	prompt: string;
	model: string | undefined;
}): Promise<{ sessionId: string }> {
	const sessionId = crypto.randomUUID();

	await relayMutation<
		{
			sessionId: string;
			workspaceId: string;
			payload: { content: string };
			metadata?: { model?: string };
		},
		{ sessionId: string; messageId: string }
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
		},
		"chat.sendMessage",
		{
			sessionId,
			workspaceId: args.workspaceId,
			payload: { content: args.prompt },
			metadata: args.model ? { model: args.model } : undefined,
		},
	);

	return { sessionId };
}

async function dispatchTerminalSession(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	command: string;
}): Promise<{ terminalId: string }> {
	const terminalId = crypto.randomUUID();

	await relayMutation<
		{
			terminalId: string;
			workspaceId: string;
			initialCommand?: string;
		},
		{ terminalId: string; status: string }
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
		},
		"terminal.ensureSession",
		{
			terminalId,
			workspaceId: args.workspaceId,
			initialCommand: args.command,
		},
	);

	return { terminalId };
}

async function dispatchOne(
	automation: SelectAutomation,
	now: Date,
): Promise<void> {
	const scheduledFor = bucketToMinute(automation.nextRunAt);

	// 1. Resolve + online-check target host
	const host = await resolveTargetHost(automation);
	if (!host) {
		await recordSkipped(automation, scheduledFor, null, "no host available");
		await advanceNextRun(automation, now);
		return;
	}
	if (!host.isOnline) {
		await recordSkipped(
			automation,
			scheduledFor,
			host.id,
			"target host offline",
		);
		await advanceNextRun(automation, now);
		return;
	}

	// 2. Idempotent run insert
	const [run] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			scheduledFor,
			hostId: host.id,
			status: "dispatching",
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning();

	if (!run) {
		// Another dispatcher instance already started this minute's run.
		// Still advance next_run_at so we don't keep reselecting it.
		await advanceNextRun(automation, now);
		return;
	}

	// 3. Mint a short-lived user JWT for the relay call
	const [owner] = await dbWs
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, automation.ownerUserId))
		.limit(1);

	const jwt = await mintUserJwt({
		userId: automation.ownerUserId,
		email: owner?.email,
		organizationIds: [automation.organizationId],
		scope: "automation-run",
		runId: run.id,
		ttlSeconds: 300,
	});

	// 4. Resolve / create workspace
	let workspaceId: string;
	try {
		if (automation.workspaceMode === "existing") {
			if (!automation.v2WorkspaceId) {
				throw new Error(
					"automation has workspaceMode=existing but no v2_workspace_id",
				);
			}
			workspaceId = automation.v2WorkspaceId;
		} else {
			if (!automation.v2ProjectId) {
				throw new Error(
					"automation has workspaceMode=new_per_run but no v2_project_id",
				);
			}
			const created = await createWorkspaceOnHost({
				relayUrl: env.RELAY_URL,
				hostId: host.id,
				jwt,
				projectId: automation.v2ProjectId,
				automation,
				runId: run.id,
			});
			workspaceId = created.workspaceId;
		}
	} catch (err) {
		await dbWs
			.update(automationRuns)
			.set({
				status: "dispatch_failed",
				error: describeError(err, "workspace allocation"),
			})
			.where(eq(automationRuns.id, run.id));
		await advanceNextRun(automation, now);
		return;
	}

	// 5. Use the snapshotted agent config from create time (includes any user
	// customizations that live only in their desktop settings).
	const agentConfig = automation.agentConfig;
	if (!agentConfig || !agentConfig.enabled) {
		await dbWs
			.update(automationRuns)
			.set({
				status: "dispatch_failed",
				v2WorkspaceId: workspaceId,
				error: `agent preset is disabled: ${agentConfig?.id ?? "unknown"}`,
			})
			.where(eq(automationRuns.id, run.id));
		await advanceNextRun(automation, now);
		return;
	}

	// 6. Dispatch to chat or terminal based on kind
	try {
		if (agentConfig.kind === "chat") {
			const { sessionId } = await dispatchChatSession({
				relayUrl: env.RELAY_URL,
				hostId: host.id,
				jwt,
				workspaceId,
				prompt: automation.prompt,
				model: agentConfig.model ?? undefined,
			});

			// Insert a chat_sessions row so the desktop can link to it.
			await dbWs.insert(chatSessions).values({
				id: sessionId,
				organizationId: automation.organizationId,
				createdBy: automation.ownerUserId,
				v2WorkspaceId: workspaceId,
				title: automation.name,
			});

			await dbWs
				.update(automationRuns)
				.set({
					status: "dispatched",
					sessionKind: "chat",
					chatSessionId: sessionId,
					v2WorkspaceId: workspaceId,
					dispatchedAt: new Date(),
				})
				.where(eq(automationRuns.id, run.id));
		} else {
			// Terminal agent — agentConfig.kind === "terminal" via discriminated union.
			const command = buildTerminalCommand({
				prompt: automation.prompt,
				config: agentConfig,
				randomId: run.id,
			});

			const { terminalId } = await dispatchTerminalSession({
				relayUrl: env.RELAY_URL,
				hostId: host.id,
				jwt,
				workspaceId,
				command,
			});

			await dbWs
				.update(automationRuns)
				.set({
					status: "dispatched",
					sessionKind: "terminal",
					terminalSessionId: terminalId,
					v2WorkspaceId: workspaceId,
					dispatchedAt: new Date(),
				})
				.where(eq(automationRuns.id, run.id));
		}
	} catch (err) {
		await dbWs
			.update(automationRuns)
			.set({
				status: "dispatch_failed",
				v2WorkspaceId: workspaceId,
				error: describeError(err, "agent dispatch"),
			})
			.where(eq(automationRuns.id, run.id));
	}

	// 7. Always advance next_run_at (at-least-once; no auto-retry on failure).
	await advanceNextRun(automation, now);
}

function describeError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) {
		return `${context}: ${err.message}`;
	}
	if (err instanceof Error) {
		return `${context}: ${err.message}`;
	}
	return `${context}: unknown error`;
}

function buildTerminalCommand(args: {
	prompt: string;
	config: TerminalResolvedAgentConfig;
	randomId: string;
}): string {
	const command = args.prompt
		? buildPromptCommandFromAgentConfig({
				prompt: args.prompt,
				randomId: args.randomId,
				config: args.config,
			})
		: getCommandFromAgentConfig(args.config);

	if (!command) {
		throw new Error(`no command configured for agent "${args.config.id}"`);
	}
	return command;
}

export async function POST(request: Request): Promise<Response> {
	if (!authorized(request)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const now = new Date();
	const lookbackStart = new Date(
		now.getTime() - DISPATCH_LOOKBACK_MINUTES * 60_000,
	);

	const due = await dbWs
		.select()
		.from(automations)
		.where(
			and(
				eq(automations.enabled, true),
				lte(automations.nextRunAt, now),
				gt(automations.nextRunAt, lookbackStart),
			),
		)
		.orderBy(automations.nextRunAt)
		.limit(DISPATCH_BATCH_SIZE);

	if (due.length === 0) {
		return Response.json({ dispatched: 0, failed: 0, skipped: 0 });
	}

	// Mark them "dispatching" early so a second cron tick arriving mid-loop
	// doesn't pick up the same batch. We use a conditional update scoped by
	// next_run_at to avoid racing a legitimate next-tick advance.
	const dueIds = due.map((a) => a.id);
	await dbWs
		.update(automations)
		.set({ nextRunAt: new Date(now.getTime() + 60_000) })
		.where(
			and(
				eq(automations.enabled, true),
				inArray(automations.id, dueIds),
				lte(automations.nextRunAt, now),
			),
		);

	const results = await Promise.allSettled(
		due.map((automation) => dispatchOne(automation, now)),
	);

	let dispatched = 0;
	let failed = 0;
	for (const result of results) {
		if (result.status === "fulfilled") {
			dispatched++;
		} else {
			failed++;
			console.error("[automations/dispatch]", result.reason);
		}
	}

	return Response.json({ dispatched, failed, total: due.length });
}
