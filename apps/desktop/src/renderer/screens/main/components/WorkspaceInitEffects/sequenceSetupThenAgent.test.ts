import { describe, expect, mock, test } from "bun:test";
import { sequenceSetupThenAgent } from "./sequenceSetupThenAgent";

function createDeferred() {
	let resolve!: () => void;
	let reject!: (err: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("sequenceSetupThenAgent", () => {
	test("launches agent only after setup commands resolve (regression for #3585)", async () => {
		const callOrder: string[] = [];
		const setup = createDeferred();

		const runSetupCommands = mock(async () => {
			callOrder.push("setup:start");
			await setup.promise;
			callOrder.push("setup:end");
		});
		const launchAgent = mock(() => {
			callOrder.push("agent:launch");
		});

		const pending = sequenceSetupThenAgent({ runSetupCommands, launchAgent });

		await Promise.resolve();
		expect(callOrder).toEqual(["setup:start"]);
		expect(launchAgent).not.toHaveBeenCalled();

		setup.resolve();
		await pending;

		expect(callOrder).toEqual(["setup:start", "setup:end", "agent:launch"]);
		expect(launchAgent).toHaveBeenCalledTimes(1);
	});

	test("does not launch agent and propagates error if setup fails", async () => {
		const runSetupCommands = mock(async () => {
			throw new Error("npm install failed");
		});
		const launchAgent = mock(() => {});

		await expect(
			sequenceSetupThenAgent({ runSetupCommands, launchAgent }),
		).rejects.toThrow("npm install failed");

		expect(launchAgent).not.toHaveBeenCalled();
	});
});
