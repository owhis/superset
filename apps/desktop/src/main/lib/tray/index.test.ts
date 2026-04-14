import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockTrayInstance = {
	setToolTip: mock(() => {}),
	setContextMenu: mock(() => {}),
	popUpContextMenu: mock(() => {}),
	on: mock(() => {}),
	destroy: mock(() => {}),
};

const mockTrayConstructor = mock(() => mockTrayInstance);

const mockMenuInstance = { items: [] };
const mockBuildFromTemplate = mock(() => mockMenuInstance);

const mockNativeImage = {
	createFromPath: mock(() => ({
		isEmpty: () => false,
		getSize: () => ({ width: 16, height: 16 }),
		setTemplateImage: mock(() => {}),
	})),
};

mock.module("electron", () => ({
	app: {
		getPath: mock(() => "/tmp"),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => "/tmp"),
		isPackaged: false,
	},
	Tray: mockTrayConstructor,
	Menu: {
		buildFromTemplate: mockBuildFromTemplate,
		setApplicationMenu: mock(() => {}),
	},
	nativeImage: mockNativeImage,
	ipcMain: { handle: mock(), on: mock() },
	dialog: {},
	shell: {},
	clipboard: {},
	screen: {
		getPrimaryDisplay: mock(() => ({
			workAreaSize: { width: 1920, height: 1080 },
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		})),
	},
	Notification: mock(() => ({ show: mock(), on: mock() })),
}));

// Mock the host-service-coordinator — track the "status-changed" handler
let statusChangedHandler: ((event: unknown) => void) | null = null;
const mockCoordinator = {
	getActiveOrganizationIds: mock(() => []),
	getConnection: mock(() => null),
	getProcessStatus: mock(() => "stopped"),
	on: mock((event: string, handler: (event: unknown) => void) => {
		if (event === "status-changed") {
			statusChangedHandler = handler;
		}
	}),
};

mock.module("main/lib/host-service-coordinator", () => ({
	getHostServiceCoordinator: () => mockCoordinator,
}));

// Re-export real fs but override existsSync so getTrayIconPath succeeds
import * as realFs from "node:fs";

mock.module("node:fs", () => ({
	...realFs,
	existsSync: () => true,
}));

mock.module("main/index", () => ({
	focusMainWindow: mock(() => {}),
	quitApp: mock(() => {}),
}));

mock.module("main/lib/menu-events", () => ({
	menuEmitter: { emit: mock(() => {}) },
}));

mock.module("main/env.main", () => ({
	env: { NEXT_PUBLIC_API_URL: "http://localhost" },
}));

mock.module("lib/trpc/routers/auth/utils/auth-functions", () => ({
	loadToken: mock(() => Promise.resolve({ token: "test-token" })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tray", () => {
	let originalPlatform: string;
	let trayModule: typeof import("./index");

	beforeEach(async () => {
		originalPlatform = process.platform;
		Object.defineProperty(process, "platform", {
			value: "darwin",
			configurable: true,
		});

		statusChangedHandler = null;

		// Reset mocks
		mockTrayInstance.setContextMenu.mockClear();
		mockTrayInstance.popUpContextMenu.mockClear();
		mockTrayInstance.on.mockClear();
		mockBuildFromTemplate.mockClear();
		mockCoordinator.on.mockClear();

		trayModule = await import("./index");
	});

	afterEach(() => {
		// Always clean up tray state so subsequent tests can reinitialize
		trayModule.disposeTray();

		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			configurable: true,
		});
	});

	test("should NOT poll on a 5-second interval to rebuild the menu (bug #3453)", () => {
		// Track setInterval calls during initialization
		const originalSetInterval = globalThis.setInterval;
		const intervalCalls: Array<{ interval: number }> = [];

		// biome-ignore lint/suspicious/noExplicitAny: test mock
		(globalThis as any).setInterval = (
			_callback: (...args: never) => unknown,
			interval: number,
		) => {
			intervalCalls.push({ interval });
			// Return a dummy timer that we immediately clear
			const id = originalSetInterval(() => {}, 999999);
			clearInterval(id);
			return id;
		};

		try {
			trayModule.initTray();

			// The bug: setInterval was called with POLL_INTERVAL_MS = 5000 to
			// continuously rebuild the menu via updateTrayMenu(), causing macOS
			// WindowServer to re-register the NSStatusItem every 5 seconds.
			// This manifests as menu bar reshuffling and cursor flicker on
			// multi-display setups.
			const pollingIntervals = intervalCalls.filter(
				(call) => call.interval === 5000,
			);

			expect(pollingIntervals).toHaveLength(0);
		} finally {
			globalThis.setInterval = originalSetInterval;
		}
	});

	test("should register click handler for on-demand menu updates", () => {
		trayModule.initTray();

		// After the fix, click/right-click handlers should be registered so the
		// menu is only built when the user interacts with the tray icon
		const onCalls = mockTrayInstance.on.mock.calls;
		const registeredEvents = onCalls.map(
			(call: unknown[]) => call[0] as string,
		);

		expect(registeredEvents).toContain("click");
	});

	test("should listen for status-changed events from coordinator", () => {
		trayModule.initTray();

		// Event-driven updates (status-changed) are fine — they only fire on
		// actual state changes, not on a timer
		expect(statusChangedHandler).not.toBeNull();
	});
});
