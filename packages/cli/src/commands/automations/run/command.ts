import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Trigger an automation to run immediately",
	options: {
		id: positional().required().desc("Automation id"),
	},
	run: async ({ ctx, options }) => {
		const result = await ctx.api.automation.runNow.mutate({
			id: options.id,
		});
		return {
			data: result,
			message: `Triggered automation ${options.id}. Dispatcher will pick it up within 1 minute.`,
		};
	},
});
