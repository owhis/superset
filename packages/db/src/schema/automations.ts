import { sql } from "drizzle-orm";
import {
	boolean,
	check,
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
	automationWorkspaceModeValues,
} from "./enums";
import { chatSessions, v2Hosts, v2Projects, v2Workspaces } from "./schema";

export const automationWorkspaceMode = pgEnum(
	"automation_workspace_mode",
	automationWorkspaceModeValues,
);

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

		/** Agent preset id (AgentDefinitionId — "claude", "amp", "codex", etc). */
		agentType: text("agent_type").notNull(),

		/** Target host (v2_hosts.id). Null = owner's most-recently-online host at dispatch. */
		targetHostId: uuid("target_host_id").references(() => v2Hosts.id, {
			onDelete: "set null",
		}),

		/**
		 * Workspace mode: "new_per_run" allocates a fresh workspace inside
		 * v2_project_id at each fire; "existing" reuses v2_workspace_id.
		 */
		workspaceMode: automationWorkspaceMode("workspace_mode")
			.notNull()
			.default("new_per_run"),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "cascade",
		}),
		v2WorkspaceId: uuid("v2_workspace_id").references(() => v2Workspaces.id, {
			onDelete: "cascade",
		}),

		/** RFC 5545 RRULE body (without DTSTART header — stored separately). */
		rrule: text().notNull(),
		dtstart: timestamp("dtstart", { withTimezone: true }).notNull(),
		timezone: text().notNull(), // IANA tz

		enabled: boolean().notNull().default(true),

		/** MCP scope. v1: empty = Superset MCP only. */
		mcpScope: jsonb("mcp_scope").$type<string[]>().notNull().default([]),

		/** Materialized next occurrence. Dispatcher hot path never re-parses rrule. */
		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }),

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
		// Enforce workspace-mode invariants at the DB level.
		check(
			"automations_workspace_mode_invariant",
			sql`(
				(${t.workspaceMode} = 'new_per_run' AND ${t.v2ProjectId} IS NOT NULL) OR
				(${t.workspaceMode} = 'existing' AND ${t.v2WorkspaceId} IS NOT NULL)
			)`,
		),
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

		/** Minute-bucketed scheduled fire time. */
		scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),

		hostId: uuid("host_id").references(() => v2Hosts.id, {
			onDelete: "set null",
		}),
		v2WorkspaceId: uuid("v2_workspace_id").references(() => v2Workspaces.id, {
			onDelete: "set null",
		}),

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
