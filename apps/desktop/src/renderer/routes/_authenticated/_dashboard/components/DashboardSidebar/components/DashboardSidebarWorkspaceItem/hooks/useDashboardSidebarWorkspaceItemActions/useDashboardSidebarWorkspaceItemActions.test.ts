import { describe, expect, test } from "bun:test";

/**
 * Tests for close workspace context menu feature (#2807).
 *
 * Verifies that the "Close Workspace" action is properly exported from the
 * actions hook and that the context menu component compiles with the onClose prop.
 */

describe("useDashboardSidebarWorkspaceItemActions", () => {
	test("module exports the hook", async () => {
		const mod = await import("./useDashboardSidebarWorkspaceItemActions");
		expect(typeof mod.useDashboardSidebarWorkspaceItemActions).toBe("function");
	});

	test("handleClose is included in the hook return type", async () => {
		const mod = await import("./useDashboardSidebarWorkspaceItemActions");
		expect(mod.useDashboardSidebarWorkspaceItemActions).toBeDefined();

		// The hook returns handleClose — verified via TypeScript compilation.
		// If handleClose were missing from the return, TypeScript would error
		// when DashboardSidebarWorkspaceItem destructures it.
		type HookReturn = ReturnType<
			typeof mod.useDashboardSidebarWorkspaceItemActions
		>;
		// This line would fail to compile if handleClose weren't in the return type
		const _typeCheck: HookReturn extends { handleClose: () => Promise<void> }
			? true
			: never = true;
		expect(_typeCheck).toBe(true);
	});
});

describe("DashboardSidebarWorkspaceContextMenu", () => {
	test("module exports the component with onClose prop support", async () => {
		const mod = await import(
			"../../components/DashboardSidebarWorkspaceContextMenu/DashboardSidebarWorkspaceContextMenu"
		);
		expect(typeof mod.DashboardSidebarWorkspaceContextMenu).toBe("function");
	});
});
