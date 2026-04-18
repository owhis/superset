import { readFileSync } from "node:fs";
import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export default command({
	description: "Create a scheduled automation",
	options: {
		name: string().required().desc("Human-readable automation name"),
		prompt: string().desc("Prompt to send to the agent"),
		promptFile: string().desc("Path to a file containing the prompt"),
		rrule: string().desc("RFC 5545 RRULE body (e.g. FREQ=DAILY;BYHOUR=9)"),
		cron: string().desc("5-field cron expression (alternative to --rrule)"),
		timezone: string().desc(`IANA timezone (default: host TZ, else UTC)`),
		dtstart: string().desc("ISO 8601 start anchor (default: now)"),
		project: string().desc(
			"v2 project id — required for new-workspace-per-run mode",
		),
		workspace: string().desc("existing v2 workspace id — reuses it every run"),
		device: string().desc("Target host id (default: owner's online host)"),
		agent: string().default("claude").desc("Agent preset id"),
	},
	run: async ({ ctx, options }) => {
		const prompt = options.prompt
			? options.prompt
			: options.promptFile
				? readFileSync(options.promptFile, "utf-8").trim()
				: null;
		if (!prompt) {
			throw new Error("Provide --prompt <text> or --prompt-file <path>");
		}

		let rrule: string;
		if (options.rrule) {
			rrule = options.rrule;
		} else if (options.cron) {
			const parsed = await ctx.api.automation.parseCron.mutate({
				cron: options.cron,
				timezone: options.timezone ?? DEFAULT_TIMEZONE,
			});
			rrule = parsed.rrule;
		} else {
			throw new Error("Provide --rrule <body> or --cron <expression>");
		}

		if (!options.project && !options.workspace) {
			throw new Error(
				"Provide --project (for new-workspace-per-run) or --workspace (to reuse an existing workspace)",
			);
		}

		const workspaceMode = options.workspace ? "existing" : "new_per_run";

		const result = await ctx.api.automation.create.mutate({
			name: options.name,
			prompt,
			agentType: options.agent,
			targetHostId: options.device ?? null,
			workspaceMode,
			v2ProjectId: options.project ?? null,
			v2WorkspaceId: options.workspace ?? null,
			rrule,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			timezone: options.timezone ?? DEFAULT_TIMEZONE,
			mcpScope: [],
		});

		const nextRun = result.nextRunAt
			? new Date(result.nextRunAt).toISOString()
			: "—";
		return {
			data: result,
			message: `Created automation "${result.name}" (${result.id})\nNext run: ${nextRun}`,
		};
	},
});
