import { describe, expect, it } from "bun:test";
import {
	getWorkspaceClientsCacheSize,
	releaseWorkspaceClients,
} from "./WorkspaceClientProvider";

describe("workspace clients cache", () => {
	it("releaseWorkspaceClients returns false for entries that do not exist", () => {
		expect(
			releaseWorkspaceClients("nonexistent-key", "http://localhost:9999"),
		).toBe(false);
	});

	it("getWorkspaceClientsCacheSize returns a non-negative count", () => {
		expect(getWorkspaceClientsCacheSize()).toBeGreaterThanOrEqual(0);
	});
});
