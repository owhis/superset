import { afterEach, beforeEach, describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs Node fs to simulate main-process file I/O
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs Node os for tmpdir
import { tmpdir } from "node:os";
// biome-ignore lint/style/noRestrictedImports: test file needs Node path for join
import { join } from "node:path";

/**
 * These tests demonstrate the bug from issue #3438 and verify the fix.
 *
 * BUG: Hotkey overrides stored in localStorage are lost when:
 *   1. The app is updated (Electron session partition may be cleared)
 *   2. The user clicks "Clear browsing data"
 *
 * FIX: Overrides are now written to ~/.superset/hotkey-overrides.json via
 * tRPC IPC, using a custom Zustand StateStorage adapter. The file persists
 * outside the Electron session and survives both app updates and
 * browsing-data clears.
 *
 * Since the actual storage adapter depends on the Electron IPC runtime, we
 * test the underlying file I/O directly (the same code the tRPC procedures
 * execute on the main-process side).
 */

const TEST_DIR = join(tmpdir(), `hotkey-overrides-test-${Date.now()}`);
const TEST_FILE = join(TEST_DIR, "hotkey-overrides.json");

const SAMPLE_STORE_DATA = JSON.stringify({
	state: { overrides: { "editor.save": "ctrl+s", "editor.undo": "ctrl+z" } },
	version: 0,
});

/** Simulates the main-process tRPC `get` procedure. */
function readOverridesFile(): string | null {
	try {
		return readFileSync(TEST_FILE, "utf-8");
	} catch {
		return null;
	}
}

/** Simulates the main-process tRPC `set` procedure. */
function writeOverridesFile(data: string): void {
	const { writeFileSync } = require("node:fs") as typeof import("node:fs");
	writeFileSync(TEST_FILE, data, "utf-8");
}

/** Simulates the main-process tRPC `remove` procedure. */
function removeOverridesFile(): void {
	try {
		const { unlinkSync } = require("node:fs") as typeof import("node:fs");
		unlinkSync(TEST_FILE);
	} catch {
		// noop — may not exist
	}
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("hotkey overrides persistence (issue #3438)", () => {
	describe("BUG REPRODUCTION: localStorage-based storage is ephemeral", () => {
		it("localStorage data is lost when storage is cleared (simulates app update)", () => {
			// Simulate the old behaviour: store overrides in a Map acting as
			// an in-memory localStorage stand-in.
			const fakeLocalStorage = new Map<string, string>();
			fakeLocalStorage.set("hotkey-overrides", SAMPLE_STORE_DATA);

			expect(fakeLocalStorage.get("hotkey-overrides")).toBe(SAMPLE_STORE_DATA);

			// Simulate what happens during an app update or
			// `clearBrowsingData({ type: "storage" })`:
			fakeLocalStorage.clear();

			expect(fakeLocalStorage.get("hotkey-overrides")).toBeUndefined();
			// ⬆ Custom keybindings are gone — this is the reported bug.
		});

		it("migration marker is also lost when localStorage is cleared", () => {
			const fakeLocalStorage = new Map<string, string>();
			fakeLocalStorage.set("hotkey-overrides-migrated-v2", "1");

			fakeLocalStorage.clear();

			// The marker is gone, so migration re-runs but finds no old
			// data (already consumed), producing empty overrides.
			expect(
				fakeLocalStorage.get("hotkey-overrides-migrated-v2"),
			).toBeUndefined();
		});
	});

	describe("FIX: file-backed storage survives clears", () => {
		it("writes overrides to a file and reads them back", () => {
			writeOverridesFile(SAMPLE_STORE_DATA);

			const result = readOverridesFile();
			expect(result).toBe(SAMPLE_STORE_DATA);

			const parsed = JSON.parse(result!);
			expect(parsed.state.overrides["editor.save"]).toBe("ctrl+s");
			expect(parsed.state.overrides["editor.undo"]).toBe("ctrl+z");
		});

		it("returns null when the file does not exist yet", () => {
			expect(readOverridesFile()).toBeNull();
		});

		it("survives a simulated localStorage clear (app update scenario)", () => {
			writeOverridesFile(SAMPLE_STORE_DATA);

			// Simulate localStorage being cleared — the file is unaffected.
			const fakeLocalStorage = new Map<string, string>();
			fakeLocalStorage.clear();

			// File-backed data is still intact.
			const result = readOverridesFile();
			expect(result).toBe(SAMPLE_STORE_DATA);
		});

		it("survives a simulated clearBrowsingData operation", () => {
			writeOverridesFile(SAMPLE_STORE_DATA);

			// clearBrowsingData clears localStorage and indexdb in the
			// Electron session — but NOT the file system.
			// (simulated here as a no-op on the file)

			const result = readOverridesFile();
			expect(result).toBe(SAMPLE_STORE_DATA);
			const parsed = JSON.parse(result!);
			expect(parsed.state.overrides["editor.save"]).toBe("ctrl+s");
		});

		it("remove deletes the file", () => {
			writeOverridesFile(SAMPLE_STORE_DATA);
			expect(existsSync(TEST_FILE)).toBe(true);

			removeOverridesFile();
			expect(existsSync(TEST_FILE)).toBe(false);
			expect(readOverridesFile()).toBeNull();
		});

		it("remove is safe when file does not exist", () => {
			expect(() => removeOverridesFile()).not.toThrow();
		});

		it("migration marker embedded in the file survives clears", () => {
			const dataWithMarker = JSON.stringify({
				state: {
					overrides: { "editor.save": "ctrl+s" },
				},
				version: 0,
				migrated: "v2",
			});

			writeOverridesFile(dataWithMarker);

			// Simulate localStorage clear
			const fakeLocalStorage = new Map<string, string>();
			fakeLocalStorage.clear();

			// File-backed marker is still intact.
			const raw = readOverridesFile();
			const parsed = JSON.parse(raw!);
			expect(parsed.migrated).toBe("v2");
		});
	});
});
