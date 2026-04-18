import {
	automationSessionKindValues,
	automationWorkspaceModeValues,
} from "@superset/db/schema";
import { z } from "zod";

const iana = z.string().min(1).describe("IANA timezone name");
const rruleBody = z
	.string()
	.min(1)
	.max(500)
	.describe("RFC 5545 RRULE body, no DTSTART prefix");

const workspaceModeSchema = z.enum(automationWorkspaceModeValues);

/**
 * Create input. Exactly one of v2WorkspaceId / v2ProjectId must be populated,
 * matching the workspace mode:
 *   - new_per_run  → v2ProjectId required, v2WorkspaceId optional/null
 *   - existing     → v2WorkspaceId required, v2ProjectId optional/null
 */
export const createAutomationSchema = z
	.object({
		name: z.string().min(1).max(200),
		prompt: z.string().min(1).max(20_000),
		agentType: z.string().min(1),
		targetHostId: z.string().uuid().nullish(),
		workspaceMode: workspaceModeSchema,
		v2ProjectId: z.string().uuid().nullish(),
		v2WorkspaceId: z.string().uuid().nullish(),
		rrule: rruleBody,
		dtstart: z.coerce.date().optional(),
		timezone: iana,
		mcpScope: z.array(z.string()).default([]),
	})
	.superRefine((val, ctx) => {
		if (val.workspaceMode === "new_per_run" && !val.v2ProjectId) {
			ctx.addIssue({
				code: "custom",
				path: ["v2ProjectId"],
				message: "v2ProjectId is required when workspaceMode = new_per_run",
			});
		}
		if (val.workspaceMode === "existing" && !val.v2WorkspaceId) {
			ctx.addIssue({
				code: "custom",
				path: ["v2WorkspaceId"],
				message: "v2WorkspaceId is required when workspaceMode = existing",
			});
		}
	});

export const updateAutomationSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(200).optional(),
	prompt: z.string().min(1).max(20_000).optional(),
	agentType: z.string().min(1).optional(),
	targetHostId: z.string().uuid().nullish(),
	workspaceMode: workspaceModeSchema.optional(),
	v2ProjectId: z.string().uuid().nullish(),
	v2WorkspaceId: z.string().uuid().nullish(),
	rrule: rruleBody.optional(),
	dtstart: z.coerce.date().optional(),
	timezone: iana.optional(),
	mcpScope: z.array(z.string()).optional(),
});

export const listRunsSchema = z.object({
	automationId: z.string().uuid(),
	limit: z.number().int().min(1).max(100).default(20),
});

export const parseRruleSchema = z.object({
	rrule: rruleBody,
	timezone: iana,
	dtstart: z.coerce.date().optional(),
});

export const sessionKindSchema = z.enum(automationSessionKindValues);

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
