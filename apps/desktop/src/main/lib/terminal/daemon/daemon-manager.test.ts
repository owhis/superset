import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { TERMINAL_ATTACH_CANCELED_MESSAGE } from "../errors";
import type { SessionInfo } from "./types";

class MockTerminalHostClient extends EventEmitter {
	createOrAttachCalls: Array<{ sessionId: string; requestId?: string }> = [];
	cancelCreateOrAttachCalls: Array<{ sessionId: string; requestId: string }> =
		[];
	killCalls: Array<{ sessionId: string; deleteHistory?: boolean }> = [];
	private pendingCreateOrAttach = new Map<
		string,
		{
			resolve: (value: {
				isNew: boolean;
				snapshot: {
					snapshotAnsi: string;
					rehydrateSequences: string;
					cwd: string | null;
					modes: Record<string, boolean>;
					cols: number;
					rows: number;
					scrollbackLines: number;
				};
				wasRecovered: boolean;
				pid: number | null;
			}) => void;
			reject: (error: Error) => void;
		}
	>();

	async kill(params: { sessionId: string; deleteHistory?: boolean }) {
		this.killCalls.push(params);
	}

	async createOrAttach(params: { sessionId: string; requestId?: string }) {
		this.createOrAttachCalls.push(params);
		return new Promise<{
			isNew: boolean;
			snapshot: {
				snapshotAnsi: string;
				rehydrateSequences: string;
				cwd: string | null;
				modes: Record<string, boolean>;
				cols: number;
				rows: number;
				scrollbackLines: number;
			};
			wasRecovered: boolean;
			pid: number | null;
		}>((resolve, reject) => {
			this.pendingCreateOrAttach.set(params.requestId ?? params.sessionId, {
				resolve,
				reject,
			});
		});
	}

	async cancelCreateOrAttach(params: { sessionId: string; requestId: string }) {
		this.cancelCreateOrAttachCalls.push(params);
		const pending = this.pendingCreateOrAttach.get(params.requestId);
		if (pending) {
			this.pendingCreateOrAttach.delete(params.requestId);
			pending.reject(new Error(TERMINAL_ATTACH_CANCELED_MESSAGE));
		}
		return { success: true as const };
	}

	resolveCreateOrAttach(requestId: string, pid = 123) {
		const pending = this.pendingCreateOrAttach.get(requestId);
		if (!pending) {
			throw new Error(`No pending createOrAttach for ${requestId}`);
		}
		this.pendingCreateOrAttach.delete(requestId);
		pending.resolve({
			isNew: true,
			wasRecovered: false,
			pid,
			snapshot: {
				snapshotAnsi: "",
				rehydrateSequences: "",
				cwd: "/tmp",
				modes: {},
				cols: 80,
				rows: 24,
				scrollbackLines: 0,
			},
		});
	}

	async listSessions() {
		return { sessions: [] };
	}

	writeNoAck() {}
	resize() {
		return Promise.resolve();
	}
	signal() {
		return Promise.resolve();
	}
	detach() {
		return Promise.resolve();
	}
	clearScrollback() {
		return Promise.resolve();
	}
}

let mockClient = new MockTerminalHostClient();

mock.module("../../terminal-host/client", () => ({
	getTerminalHostClient: () => mockClient,
	disposeTerminalHostClient: () => {},
}));

mock.module("main/lib/analytics", () => ({
	track: () => {},
}));

mock.module("../env", () => ({
	buildTerminalEnv: () => ({}),
	getDefaultShell: () => "/bin/zsh",
}));

mock.module("main/lib/app-state", () => ({
	appState: { data: null },
}));

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				all: () => [],
				get: () => undefined,
			}),
		}),
	},
}));

mock.module("@superset/local-db", () => ({
	workspaces: { id: "id" },
}));

mock.module("../port-manager", () => ({
	portManager: {
		upsertDaemonSession: () => {},
		unregisterDaemonSession: () => {},
		checkOutputForHint: () => {},
	},
}));

mock.module("./history-manager", () => ({
	HistoryManager: class {
		cleanupHistory() {
			return Promise.resolve();
		}
		initHistoryWriter() {
			return Promise.resolve();
		}
		writeToHistory() {}
		closeHistoryWriter() {}
		reset() {
			return Promise.resolve();
		}
	},
}));

const { DaemonTerminalManager } = await import("./daemon-manager");

describe("DaemonTerminalManager kill tracking", () => {
	beforeEach(() => {
		mockClient = new MockTerminalHostClient();
	});

	it("waits for daemon exit and labels killed sessions", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-kill-1";
		const sessions = (
			manager as unknown as { sessions: Map<string, SessionInfo> }
		).sessions;
		sessions.set(paneId, {
			paneId,
			workspaceId: "ws-1",
			isAlive: true,
			lastActive: Date.now(),
			cwd: "",
			pid: 123,
			cols: 80,
			rows: 24,
		});

		let exitReason: string | undefined;
		manager.on(`exit:${paneId}`, (_exitCode, _signal, reason) => {
			exitReason = reason;
		});

		await manager.kill({ paneId });
		expect(exitReason).toBeUndefined();

		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("killed");
		expect(mockClient.killCalls.length).toBe(1);
	});

	it("labels exit as killed even if session is missing", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-kill-2";

		let exitReason: string | undefined;
		manager.on(`exit:${paneId}`, (_exitCode, _signal, reason) => {
			exitReason = reason;
		});

		await manager.kill({ paneId });
		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("killed");
	});

	it("defaults exit reason to exited when no kill tombstone exists", () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-exit-1";

		let exitReason: string | undefined;
		manager.on(`exit:${paneId}`, (_exitCode, _signal, reason) => {
			exitReason = reason;
		});

		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("exited");
	});

	it("supersedes older createOrAttach requests for the same pane", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-attach-1";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);

		const firstPromise = manager.createOrAttach({
			paneId,
			requestId: "req-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		const secondPromise = manager.createOrAttach({
			paneId,
			requestId: "req-2",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});

		await expect(firstPromise).rejects.toThrow(
			TERMINAL_ATTACH_CANCELED_MESSAGE,
		);
		expect(mockClient.cancelCreateOrAttachCalls).toEqual([
			{ sessionId: paneId, requestId: "req-1" },
		]);

		mockClient.resolveCreateOrAttach("req-2", 456);
		await expect(secondPromise).resolves.toMatchObject({
			isNew: true,
			wasRecovered: false,
			snapshot: {
				cwd: "/tmp",
			},
		});
		expect(
			mockClient.createOrAttachCalls.map(({ sessionId, requestId }) => ({
				sessionId,
				requestId,
			})),
		).toEqual([
			{ sessionId: paneId, requestId: "req-1" },
			{ sessionId: paneId, requestId: "req-2" },
		]);
	});
});
