import { describe, expect, test } from "bun:test";
import { requestLocalNetworkAccess } from "./local-network-permission";

describe("requestLocalNetworkAccess", () => {
	test("is exported as a callable function", () => {
		expect(typeof requestLocalNetworkAccess).toBe("function");
	});

	test("is a no-op on non-macOS platforms", () => {
		// On Linux/Windows CI, this should return immediately without error
		if (process.platform !== "darwin") {
			expect(() => requestLocalNetworkAccess()).not.toThrow();
		}
	});

	test("is wired into app startup alongside other permission requests", async () => {
		// The main entry point must import and call requestLocalNetworkAccess
		// during startup so macOS prompts the user for local network access.
		// Without this, child processes (Node.js, Python) spawned from the
		// terminal are silently blocked from making local network connections
		// (see issue #3474).
		const mainSource = await Bun.file(
			new URL("../index.ts", import.meta.url).pathname,
		).text();

		// Verify the import exists
		expect(mainSource).toContain("requestLocalNetworkAccess");

		// Verify it's imported from the correct module
		expect(mainSource).toMatch(/from.*local-network-permission/);

		// Verify the function is actually called (not just imported)
		// The call should be near requestAppleEventsAccess since both
		// are macOS permission triggers at startup
		expect(mainSource).toMatch(/requestLocalNetworkAccess\(\)/);
	});
});
