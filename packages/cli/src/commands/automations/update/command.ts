import { readFileSync } from "node:fs";
import { boolean, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Update an automation",
	options: {
		id: positional().required().desc("Automation id"),
		name: string().desc("New name"),
		prompt: string().desc("New prompt"),
		promptFile: string().desc("Path to a file with the new prompt"),
		rrule: string().desc("New RRule body (RFC 5545)"),
		timezone: string().desc("New IANA timezone"),
		dtstart: string().desc("New ISO 8601 start anchor"),
		agent: string().desc("New agent preset id"),
		device: string().desc("New target host id"),
		enabled: boolean().desc("Enable or pause the automation"),
	},
	run: async ({ ctx, options }) => {
		const promptFromFile = options.promptFile
			? readFileSync(options.promptFile, "utf-8").trim()
			: undefined;
		const prompt = options.prompt ?? promptFromFile;

		if (options.enabled !== undefined) {
			await ctx.api.automation.setEnabled.mutate({
				id: options.id,
				enabled: options.enabled,
			});
		}

		const result = await ctx.api.automation.update.mutate({
			id: options.id,
			name: options.name,
			prompt,
			rrule: options.rrule,
			timezone: options.timezone,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			agentType: options.agent,
			targetHostId: options.device ?? null,
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});
