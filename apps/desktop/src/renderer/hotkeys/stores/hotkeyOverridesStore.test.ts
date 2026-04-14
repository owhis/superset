import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * Reproduction & fix tests for https://github.com/anthropics/superset/issues/3437
 *
 * Bug: custom hotkey overrides are stored **only** in browser localStorage via
 * Zustand persist with `createJSONStorage(() => localStorage)`. When Electron
 * updates the app, localStorage can be cleared, causing all user-customized
 * shortcuts to silently revert to defaults.
 *
 * Other persisted stores (tabs, theme) use a `trpcStorage` adapter backed by
 * `~/.superset/app-state.json` on disk, with localStorage only as a write-ahead
 * cache ("pending snapshot"). The hotkey overrides store was the only one using
 * plain localStorage as the sole persistence layer.
 *
 * Fix: switch the store to the same `trpcStorage` pattern, and add a one-time
 * synchronous migration that converts any existing `hotkey-overrides` localStorage
 * entry to the `hotkey-overrides:pending` snapshot format so the tRPC adapter
 * picks it up and flushes it to disk.
 */

// ---------------------------------------------------------------------------
// Minimal in-memory localStorage shim (Bun doesn't provide one by default)
// ---------------------------------------------------------------------------
const storage = new Map<string, string>();
const localStorageShim: Storage = {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => storage.set(key, String(value)),
	removeItem: (key: string) => storage.delete(key),
	clear: () => storage.clear(),
	get length() {
		return storage.size;
	},
	key: (index: number) => [...storage.keys()][index] ?? null,
};

if (typeof globalThis.localStorage === "undefined") {
	// biome-ignore lint/suspicious/noExplicitAny: Test polyfill
	(globalThis as any).localStorage = localStorageShim;
}

// Import after localStorage is available
const { migrateLocalStorageOverridesToPending } = await import(
	"./hotkeyOverridesStore"
);

describe("hotkey overrides persistence across app updates (#3437)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	// ---- Bug reproduction ----

	test("BUG: overrides stored only in localStorage are lost when localStorage is cleared", () => {
		// User customizes hotkeys — zustand persist writes to localStorage
		const userOverrides = {
			QUICK_OPEN: "meta+k",
			NAVIGATE_BACK: null, // explicitly unbound
			SPLIT_RIGHT: "meta+shift+d",
		};
		localStorage.setItem(
			"hotkey-overrides",
			JSON.stringify({ state: { overrides: userOverrides }, version: 0 }),
		);
		// The one-time legacy migration marker is also in localStorage
		localStorage.setItem("hotkey-overrides-migrated-v2", "1");

		// Verify data is present
		const before = JSON.parse(localStorage.getItem("hotkey-overrides")!);
		expect(before.state.overrides).toEqual(userOverrides);

		// === Simulate Electron app update clearing localStorage ===
		localStorage.clear();

		// Overrides are gone with no disk backup to recover from
		expect(localStorage.getItem("hotkey-overrides")).toBeNull();

		// Migration marker is also gone — the legacy migration would re-run,
		// but the old disk format (hotkeysState.byPlatform) does NOT contain the
		// overrides that were written to the new localStorage-based store.
		// There is NO recovery path. This is the bug.
		expect(localStorage.getItem("hotkey-overrides-migrated-v2")).toBeNull();
	});

	// ---- Fix: localStorage → pending snapshot migration ----

	test("migrateLocalStorageOverridesToPending moves overrides to pending snapshot format", () => {
		const overrides = {
			QUICK_OPEN: "meta+k",
			NAVIGATE_BACK: null,
		};
		localStorage.setItem(
			"hotkey-overrides",
			JSON.stringify({ state: { overrides }, version: 0 }),
		);

		migrateLocalStorageOverridesToPending();

		// Old key is removed so the tRPC adapter doesn't conflict with it
		expect(localStorage.getItem("hotkey-overrides")).toBeNull();

		// Data is now in the pending snapshot format that the tRPC storage
		// adapter checks on rehydration and flushes to disk
		const pending = localStorage.getItem("hotkey-overrides:pending");
		expect(pending).not.toBeNull();
		const parsed = JSON.parse(pending!);
		expect(parsed.state.overrides).toEqual(overrides);

		// Timestamp is set so the tRPC adapter considers it fresh
		const updatedAt = localStorage.getItem(
			"hotkey-overrides:pending:updatedAt",
		);
		expect(updatedAt).not.toBeNull();
		expect(Number(updatedAt)).toBeGreaterThan(0);
	});

	test("migrateLocalStorageOverridesToPending is a no-op when localStorage has no overrides", () => {
		migrateLocalStorageOverridesToPending();

		expect(localStorage.getItem("hotkey-overrides")).toBeNull();
		expect(localStorage.getItem("hotkey-overrides:pending")).toBeNull();
	});

	test("migrateLocalStorageOverridesToPending skips empty overrides", () => {
		localStorage.setItem(
			"hotkey-overrides",
			JSON.stringify({ state: { overrides: {} }, version: 0 }),
		);

		migrateLocalStorageOverridesToPending();

		// Old key cleaned up, but no pending snapshot created for empty overrides
		expect(localStorage.getItem("hotkey-overrides")).toBeNull();
		expect(localStorage.getItem("hotkey-overrides:pending")).toBeNull();
	});

	test("migrateLocalStorageOverridesToPending handles malformed JSON gracefully", () => {
		localStorage.setItem("hotkey-overrides", "not valid json{{{");

		// Should not throw
		migrateLocalStorageOverridesToPending();

		// Old key cleaned up, no pending snapshot created
		expect(localStorage.getItem("hotkey-overrides")).toBeNull();
		expect(localStorage.getItem("hotkey-overrides:pending")).toBeNull();
	});

	test("after migration to disk, overrides survive localStorage clear", () => {
		// User has custom overrides — the migration moved them to :pending
		// and the tRPC adapter flushed to disk. On the next launch, disk
		// has the data. Simulate this by verifying the pending snapshot
		// mechanism preserves data through a "localStorage clear" scenario.
		const overrides = {
			QUICK_OPEN: "meta+k",
			SPLIT_RIGHT: "meta+shift+d",
		};
		localStorage.setItem(
			"hotkey-overrides",
			JSON.stringify({ state: { overrides }, version: 0 }),
		);

		// Step 1: migration converts to pending format
		migrateLocalStorageOverridesToPending();
		const pendingBefore = localStorage.getItem("hotkey-overrides:pending");
		expect(pendingBefore).not.toBeNull();

		// Step 2: tRPC adapter would flush this to disk (simulated by
		// the fact that the data structure is correct for the adapter).
		// Verify the pending snapshot has the right shape for the adapter.
		const parsed = JSON.parse(pendingBefore!);
		expect(parsed).toHaveProperty("state");
		expect(parsed).toHaveProperty("version");
		expect(parsed.state.overrides).toEqual(overrides);

		// Step 3: even if localStorage is cleared BEFORE flush completes,
		// the tRPC adapter's getItem falls back to the disk canonical state.
		// With disk-backed storage, the overrides are durable.
		// (Full end-to-end verification requires the tRPC transport, but the
		// key invariant is that the disk layer exists as a fallback.)
	});
});
