import { trpcHotkeyOverridesStorage } from "renderer/lib/trpc-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HotkeyOverridesState {
	overrides: Record<string, string | null>;
	setOverride: (id: string, keys: string | null) => void;
	resetOverride: (id: string) => void;
	resetAll: () => void;
}

/**
 * One-time synchronous migration: converts any existing `hotkey-overrides`
 * localStorage entry (written by the old `createJSONStorage(() => localStorage)`
 * backend) into the `hotkey-overrides:pending` snapshot format that the tRPC
 * storage adapter recognises on rehydration.
 *
 * Runs at module load time — before the store is created — so the tRPC adapter's
 * `getItem` will find the pending snapshot and flush it to disk.
 *
 * Exported for testing.
 */
export function migrateLocalStorageOverridesToPending(): void {
	const raw = localStorage.getItem("hotkey-overrides");
	if (!raw) return;

	try {
		const parsed = JSON.parse(raw) as {
			state?: { overrides?: Record<string, string | null> };
			version?: number;
		};
		const overrides = parsed?.state?.overrides;
		if (overrides && Object.keys(overrides).length > 0) {
			localStorage.setItem("hotkey-overrides:pending", raw);
			localStorage.setItem(
				"hotkey-overrides:pending:updatedAt",
				String(Date.now()),
			);
		}
	} catch {
		// Malformed JSON — drop silently
	}

	// Remove the old key regardless so it doesn't interfere with the tRPC adapter
	localStorage.removeItem("hotkey-overrides");
}

// Run the migration synchronously before the store is created.
// Safe to call in non-browser contexts (Bun tests provide a localStorage shim).
if (typeof localStorage !== "undefined") {
	migrateLocalStorageOverridesToPending();
}

export const useHotkeyOverridesStore = create<HotkeyOverridesState>()(
	persist(
		(set) => ({
			overrides: {},
			setOverride: (id, keys) =>
				set((state) => ({
					overrides: { ...state.overrides, [id]: keys },
				})),
			resetOverride: (id) =>
				set((state) => {
					const next = { ...state.overrides };
					delete next[id];
					return { overrides: next };
				}),
			resetAll: () => set({ overrides: {} }),
		}),
		{
			name: "hotkey-overrides",
			storage: trpcHotkeyOverridesStorage,
			partialize: (state) => ({ overrides: state.overrides }),
		},
	),
);
