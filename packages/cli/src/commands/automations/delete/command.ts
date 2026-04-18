import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Delete an automation",
	options: {
		id: positional().required().desc("Automation id"),
	},
	run: async ({ ctx, options }) => {
		await ctx.api.automation.delete.mutate({ id: options.id });
		return {
			data: { ok: true },
			message: `Deleted automation ${options.id}`,
		};
	},
});
