import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	automationRunStatusValues,
	automationSessionKindValues,
} from "./enums";
import { chatSessions, v2Hosts, v2Projects } from "./schema";

export const automationRunStatus = pgEnum(
	"automation_run_status",
	automationRunStatusValues,
);

export const automationSessionKind = pgEnum(
	"automation_session_kind",
	automationSessionKindValues,
);

/**
 * Scheduled automation definition. Each automation describes a prompt that
 * should fire on a cron-like recurrence against a target host + workspace
 * (or a freshly allocated workspace per run).
 */
export const automations = pgTable(
	"automations",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		prompt: text().notNull(),

		/**
		 * Full resolved agent config snapshotted at create time. Lets the cloud
		 * dispatcher build the exact same AgentLaunchRequest the user saw —
		 * including user customizations (overridden command, model, etc.) that
		 * live only in the desktop's local settings. Treat as frozen at create
		 * time; updating the user's preset later does not retroactively change
		 * existing automations. The preset id is `agentConfig.id`.
		 */
		agentConfig: jsonb("agent_config").$type<ResolvedAgentConfig>().notNull(),

		/** Target host (v2_hosts.id). Null = owner's most-recently-online host at dispatch. */
		targetHostId: uuid("target_host_id").references(() => v2Hosts.id, {
			onDelete: "set null",
		}),

		v2ProjectId: uuid("v2_project_id")
			.notNull()
			.references(() => v2Projects.id, { onDelete: "cascade" }),
		v2WorkspaceId: uuid("v2_workspace_id"),

		/** RFC 5545 RRULE body (without DTSTART header — stored separately). */
		rrule: text().notNull(),
		dtstart: timestamp("dtstart", { withTimezone: true }).notNull(),
		timezone: text().notNull(), // IANA tz

		enabled: boolean().notNull().default(true),

		/** MCP scope. v1: empty = Superset MCP only. */
		mcpScope: jsonb("mcp_scope").$type<string[]>().notNull().default([]),

		/** Materialized next occurrence. Dispatcher hot path never re-parses rrule. */
		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("automations_dispatcher_idx").on(t.enabled, t.nextRunAt),
		index("automations_owner_idx").on(t.ownerUserId),
		index("automations_organization_idx").on(t.organizationId),
	],
);

export type InsertAutomation = typeof automations.$inferInsert;
export type SelectAutomation = typeof automations.$inferSelect;

/**
 * One row per scheduled dispatch attempt. Idempotent on
 * (automation_id, scheduled_for) so Vercel Cron double-deliveries are absorbed.
 */
export const automationRuns = pgTable(
	"automation_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		automationId: uuid("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		/** Snapshot of automations.name at dispatch time — preserves what the run
		 *  was called even if the automation is renamed later. */
		title: text().notNull(),

		/** Minute-bucketed scheduled fire time. */
		scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),

		hostId: uuid("host_id").references(() => v2Hosts.id, {
			onDelete: "set null",
		}),
		v2WorkspaceId: uuid("v2_workspace_id"),

		/** null until the run reaches "dispatched". */
		sessionKind: automationSessionKind("session_kind"),
		chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, {
			onDelete: "set null",
		}),
		terminalSessionId: text("terminal_session_id"),

		status: automationRunStatus().notNull().default("pending"),
		error: text(),
		dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("automation_runs_dedup_idx").on(t.automationId, t.scheduledFor),
		index("automation_runs_history_idx").on(t.automationId, t.createdAt),
		index("automation_runs_status_idx").on(t.status),
		index("automation_runs_workspace_idx").on(t.v2WorkspaceId),
	],
);

export type InsertAutomationRun = typeof automationRuns.$inferInsert;
export type SelectAutomationRun = typeof automationRuns.$inferSelect;
