import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Pane } from "shared/tabs-types";

/**
 * Reproduction test for GitHub issue #3240:
 * Closing terminal tabs should prompt for confirmation when there are active sessions.
 *
 * Previously, `requestTabClose()` only checked for dirty file-viewer documents.
 * If a tab contained terminal panes with active sessions, the tab was closed
 * immediately and the terminal was killed without any confirmation.
 *
 * Fix: `requestTabClose()` now checks for active terminal panes and sets
 * `pendingTerminalTabClose` state to trigger a confirmation dialog.
 */

// Mock terminal cleanup so we can track kills without IPC
const killTerminalForPane = mock(() => {});
mock.module("renderer/stores/tabs/utils/terminal-cleanup", () => ({
	killTerminalForPane,
}));

// Mock posthog to avoid analytics calls
mock.module("renderer/lib/posthog", () => ({
	posthog: { capture: mock(() => {}) },
}));

// Mock trpc-storage to avoid persistence
mock.module("renderer/lib/trpc-storage", () => ({
	trpcTabsStorage: {
		getItem: mock(() => null),
		setItem: mock(() => {}),
		removeItem: mock(() => {}),
	},
}));

// Mock file-open-mode hook
mock.module("renderer/hooks/useFileOpenMode", () => ({
	getFileOpenMode: mock(() => "active-tab"),
}));

// Mock invalidate-file-save-queries
mock.module("renderer/lib/invalidate-file-save-queries", () => ({
	invalidateFileSaveQueries: mock(() => {}),
}));

// Mock trpc-client
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		terminal: {
			kill: { mutate: mock(() => Promise.resolve()) },
		},
		files: {
			save: { mutate: mock(() => Promise.resolve()) },
		},
	},
}));

// Now import the modules under test (after mocks are set up)
const { useTabsStore } = await import("renderer/stores/tabs/store");
const {
	requestTabClose,
	confirmPendingTerminalTabClose,
	cancelPendingTerminalTabClose,
} = await import("renderer/stores/editor-state/editorCoordinator");
const { useEditorSessionsStore } = await import(
	"renderer/stores/editor-state/useEditorSessionsStore"
);

function createTerminalPane(
	id: string,
	tabId: string,
	overrides?: Partial<Pane>,
): Pane {
	return {
		id,
		tabId,
		type: "terminal",
		name: "Terminal",
		...overrides,
	};
}

function seedTabWithTerminalPane(
	tabId: string,
	paneId: string,
	workspaceId = "ws-1",
) {
	const pane = createTerminalPane(paneId, tabId);
	useTabsStore.setState({
		tabs: [
			{
				id: tabId,
				name: "Tab 1",
				workspaceId,
				createdAt: Date.now(),
				layout: paneId,
			},
		],
		panes: { [paneId]: pane },
		activeTabIds: { [workspaceId]: tabId },
		focusedPaneIds: { [tabId]: paneId },
		closedTabsStack: [],
		tabHistoryStacks: {},
	});
}

beforeEach(() => {
	// Reset stores to clean state
	useTabsStore.setState({
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		closedTabsStack: [],
		tabHistoryStacks: {},
	});
	useEditorSessionsStore.setState({
		sessions: {},
		pendingTabClose: null,
		pendingTerminalTabClose: null,
	});
	killTerminalForPane.mockClear();
});

describe("issue #3240: closing terminal tabs should prompt for confirmation", () => {
	test("requestTabClose sets pendingTerminalTabClose instead of immediately closing", () => {
		seedTabWithTerminalPane("tab-1", "pane-1");

		// Verify the tab and pane exist
		expect(useTabsStore.getState().tabs).toHaveLength(1);
		expect(useTabsStore.getState().panes["pane-1"]?.type).toBe("terminal");

		// Close the tab — should NOT immediately close, should return false
		const result = requestTabClose("tab-1");

		expect(result).toBe(false);
		// Tab should still exist — not removed yet
		expect(useTabsStore.getState().tabs).toHaveLength(1);
		// Terminal should NOT have been killed yet
		expect(killTerminalForPane).not.toHaveBeenCalled();
		// Pending state should be set for the confirmation dialog
		const pending = useEditorSessionsStore.getState().pendingTerminalTabClose;
		expect(pending).not.toBeNull();
		expect(pending?.tabId).toBe("tab-1");
		expect(pending?.terminalPaneIds).toEqual(["pane-1"]);
		expect(pending?.workspaceId).toBe("ws-1");
	});

	test("confirmPendingTerminalTabClose removes the tab and kills the terminal", () => {
		seedTabWithTerminalPane("tab-1", "pane-1");
		requestTabClose("tab-1");

		// User confirms — close the tab
		confirmPendingTerminalTabClose("ws-1");

		expect(useTabsStore.getState().tabs).toHaveLength(0);
		expect(killTerminalForPane).toHaveBeenCalledWith("pane-1");
		expect(
			useEditorSessionsStore.getState().pendingTerminalTabClose,
		).toBeNull();
	});

	test("cancelPendingTerminalTabClose clears state without closing tab", () => {
		seedTabWithTerminalPane("tab-1", "pane-1");
		requestTabClose("tab-1");

		// User cancels — keep the tab open
		cancelPendingTerminalTabClose("ws-1");

		expect(useTabsStore.getState().tabs).toHaveLength(1);
		expect(killTerminalForPane).not.toHaveBeenCalled();
		expect(
			useEditorSessionsStore.getState().pendingTerminalTabClose,
		).toBeNull();
	});

	test("closing a tab with no terminal panes and no dirty docs should close immediately", () => {
		// Tab with only a file-viewer pane (no dirty state)
		const pane: Pane = {
			id: "pane-fv",
			tabId: "tab-2",
			type: "file-viewer",
			name: "file.ts",
			fileViewer: {
				filePath: "/test/file.ts",
				viewMode: "raw",
				isPinned: false,
				diffLayout: "inline",
			},
		};
		useTabsStore.setState({
			tabs: [
				{
					id: "tab-2",
					name: "Tab 2",
					workspaceId: "ws-1",
					createdAt: Date.now(),
					layout: "pane-fv",
				},
			],
			panes: { "pane-fv": pane },
			activeTabIds: { "ws-1": "tab-2" },
			focusedPaneIds: { "tab-2": "pane-fv" },
			closedTabsStack: [],
			tabHistoryStacks: {},
		});

		const result = requestTabClose("tab-2");

		// This should close immediately — no terminal, no dirty docs
		expect(result).toBe(true);
		expect(useTabsStore.getState().tabs).toHaveLength(0);
	});

	test("closing a nonexistent tab returns true", () => {
		const result = requestTabClose("nonexistent-tab");
		expect(result).toBe(true);
	});
});
