export interface SequenceSetupThenAgentOptions {
	runSetupCommands: () => Promise<void>;
	launchAgent: () => void;
}

/**
 * Runs workspace setup commands, then launches the agent.
 *
 * Why: the agent must not begin executing tool calls against a half-initialized
 * workspace. If the agent starts before `npm install` finishes, it sees missing
 * binaries and may try to "recover" by running `npm install` itself in parallel
 * with the setup script, corrupting `node_modules`. See #3585.
 *
 * If `runSetupCommands` rejects, `launchAgent` is not invoked and the rejection
 * propagates to the caller so it can surface the failure.
 */
export async function sequenceSetupThenAgent(
	options: SequenceSetupThenAgentOptions,
): Promise<void> {
	await options.runSetupCommands();
	options.launchAgent();
}
