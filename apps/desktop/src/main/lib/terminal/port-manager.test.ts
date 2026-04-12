import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Tests for PortManager — specifically the excessive lsof spawning bug (#3372).
 *
 * The bug: PortManager spawns lsof processes every 2.5s via setInterval and
 * never stops scanning, even when all sessions have been unregistered (workspaces
 * closed). Additionally, hint-triggered scans bypass the isScanning guard, allowing
 * concurrent lsof processes to pile up.
 *
 * These tests mock the port-scanner module and verify that:
 * 1. No scans run when there are no registered sessions
 * 2. Scans start only when sessions are registered
 * 3. Scans stop when all sessions are unregistered
 * 4. Hint-triggered scans are skipped when a scan is already in progress
 */

// Mock port-scanner to track lsof invocations
let getProcessTreeCallCount = 0;
let getListeningPortsCallCount = 0;

mock.module("./port-scanner", () => ({
	getProcessTree: async (_pid: number) => {
		getProcessTreeCallCount++;
		return [_pid, _pid + 1];
	},
	getListeningPortsForPids: async (_pids: number[]) => {
		getListeningPortsCallCount++;
		return [];
	},
}));

// Mock tree-kill to avoid actual process killing
mock.module("../tree-kill", () => ({
	treeKillWithEscalation: async () => ({ success: true }),
}));

// We need to dynamically import PortManager after mocks are set up
// The module-level singleton would already have started scanning, so we
// test the class directly by re-importing it.

// biome-ignore lint/suspicious/noExplicitAny: test mock
let PortManagerModule: any;

beforeEach(async () => {
	getProcessTreeCallCount = 0;
	getListeningPortsCallCount = 0;
	// Fresh import each test to get a fresh PortManager singleton
	PortManagerModule = await import("./port-manager");
});

afterEach(() => {
	// Stop any running intervals
	if (PortManagerModule?.portManager) {
		PortManagerModule.portManager.stopPeriodicScan();
	}
});

function makeFakeSession(paneId: string, pid: number) {
	return {
		paneId,
		pty: { pid },
		isAlive: true,
	};
}

describe("PortManager — lsof spawning behavior (#3372)", () => {
	it("should not run scans when no sessions are registered", async () => {
		const pm = PortManagerModule.portManager;
		// Stop the auto-started interval so we can test forceScan directly
		pm.stopPeriodicScan();

		getProcessTreeCallCount = 0;
		getListeningPortsCallCount = 0;

		// Force a scan with no sessions registered
		await pm.forceScan();

		// No sessions means no process tree lookups and no lsof calls
		expect(getProcessTreeCallCount).toBe(0);
		expect(getListeningPortsCallCount).toBe(0);
	});

	it("should run scans when sessions are registered", async () => {
		const pm = PortManagerModule.portManager;
		pm.stopPeriodicScan();

		const session = makeFakeSession("pane-1", 1000);
		pm.registerSession(session, "workspace-1");

		getProcessTreeCallCount = 0;
		getListeningPortsCallCount = 0;

		await pm.forceScan();

		// Should have scanned the registered session
		expect(getProcessTreeCallCount).toBeGreaterThan(0);
		expect(getListeningPortsCallCount).toBeGreaterThan(0);

		pm.unregisterSession("pane-1");
	});

	it("should not run scans after all sessions are unregistered", async () => {
		const pm = PortManagerModule.portManager;
		pm.stopPeriodicScan();

		// Register then unregister
		const session = makeFakeSession("pane-1", 1000);
		pm.registerSession(session, "workspace-1");
		pm.unregisterSession("pane-1");

		getProcessTreeCallCount = 0;
		getListeningPortsCallCount = 0;

		await pm.forceScan();

		// All sessions removed — no scans should happen
		expect(getProcessTreeCallCount).toBe(0);
		expect(getListeningPortsCallCount).toBe(0);
	});

	it("should not run scans after all daemon sessions are unregistered", async () => {
		const pm = PortManagerModule.portManager;
		pm.stopPeriodicScan();

		// Register then unregister a daemon session
		pm.upsertDaemonSession("pane-d1", "workspace-1", 2000);
		pm.unregisterDaemonSession("pane-d1");

		getProcessTreeCallCount = 0;
		getListeningPortsCallCount = 0;

		await pm.forceScan();

		expect(getProcessTreeCallCount).toBe(0);
		expect(getListeningPortsCallCount).toBe(0);
	});

	it("should handle mixed session types and only stop when all are gone", async () => {
		const pm = PortManagerModule.portManager;
		pm.stopPeriodicScan();

		const session = makeFakeSession("pane-1", 1000);
		pm.registerSession(session, "workspace-1");
		pm.upsertDaemonSession("pane-d1", "workspace-2", 2000);

		// Remove only the regular session
		pm.unregisterSession("pane-1");

		getProcessTreeCallCount = 0;
		getListeningPortsCallCount = 0;

		await pm.forceScan();

		// Daemon session still exists — scan should still run
		expect(getProcessTreeCallCount).toBeGreaterThan(0);

		// Now remove the daemon session too
		pm.unregisterDaemonSession("pane-d1");

		getProcessTreeCallCount = 0;
		getListeningPortsCallCount = 0;

		await pm.forceScan();

		// All gone — no scans
		expect(getProcessTreeCallCount).toBe(0);
		expect(getListeningPortsCallCount).toBe(0);
	});

	it("should skip hint-triggered scan when a scan is already in progress", async () => {
		const pm = PortManagerModule.portManager;
		pm.stopPeriodicScan();

		const session = makeFakeSession("pane-1", 1000);
		pm.registerSession(session, "workspace-1");

		// Start a regular scan (don't await yet)
		const scanPromise = pm.forceScan();

		getListeningPortsCallCount = 0;

		// While the scan is in progress, trigger a hint scan for the same pane
		// This should be skipped because isScanning is true
		await pm.forceScanPane("pane-1");

		await scanPromise;

		// The hint scan's lsof call should have been skipped (at most 1 call from the forceScan)
		expect(getListeningPortsCallCount).toBeLessThanOrEqual(1);

		pm.unregisterSession("pane-1");
	});

	it("periodic scan should not accumulate lsof calls with many workspaces", async () => {
		const pm = PortManagerModule.portManager;
		pm.stopPeriodicScan();

		// Register many sessions (simulating many open workspaces)
		const sessions = [];
		for (let i = 0; i < 10; i++) {
			const session = makeFakeSession(`pane-${i}`, 1000 + i);
			pm.registerSession(session, `workspace-${i}`);
			sessions.push(session);
		}

		getListeningPortsCallCount = 0;

		// A single bulk scan should only make ONE lsof call (batched PIDs)
		await pm.forceScan();

		// The bulk scan batches all PIDs into a single getListeningPortsForPids call
		expect(getListeningPortsCallCount).toBe(1);

		// Clean up
		for (let i = 0; i < 10; i++) {
			pm.unregisterSession(`pane-${i}`);
		}
	});
});
