/**
 * One-time migration from the old hotkey storage (main process JSON file via tRPC)
 * to the new file-backed Zustand store.
 *
 * The migration marker is written into the file-backed store itself (as a
 * `migrated` field) so it survives app updates and browsing data clears —
 * unlike the previous approach which stored the marker in localStorage.
 *
 * Marker key is bumped (`-v2`) so users who migrated on the pre-sanitizer
 * build re-run once and get their corrupt entries dropped.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PLATFORM } from "./registry";
import { sanitizeOverride } from "./utils/sanitizeOverride";

const PLATFORM_MAP = {
	mac: "darwin",
	windows: "win32",
	linux: "linux",
} as const;

/**
 * Check if migration has already been completed by reading the file-backed
 * store and looking for a `migrated` marker.
 */
async function isMigrated(): Promise<boolean> {
	const raw = await electronTrpcClient.uiState.hotkeyOverrides.get.query();
	if (!raw) return false;
	try {
		const parsed = JSON.parse(raw);
		return parsed?.migrated === "v2";
	} catch {
		return false;
	}
}

/**
 * Mark migration as complete by writing the marker into the file-backed store.
 */
async function setMigrated(
	overrides: Record<string, string | null>,
): Promise<void> {
	const data = JSON.stringify({
		state: { overrides },
		version: 0,
		migrated: "v2",
	});
	await electronTrpcClient.uiState.hotkeyOverrides.set.mutate({ data });
}

export async function migrateHotkeyOverrides(): Promise<void> {
	if (await isMigrated()) return;

	try {
		const oldState = await electronTrpcClient.uiState.hotkeys.get.query();
		const oldPlatformKey = PLATFORM_MAP[PLATFORM];
		const oldOverrides = oldState?.byPlatform?.[oldPlatformKey];
		if (!oldOverrides || Object.keys(oldOverrides).length === 0) {
			await setMigrated({});
			console.log("[hotkeys] Migration skipped — no old overrides found");
			return;
		}

		const cleaned: Record<string, string | null> = {};
		let dropped = 0;
		for (const [id, raw] of Object.entries(oldOverrides)) {
			const sanitized = sanitizeOverride(raw);
			if (sanitized === undefined) {
				dropped++;
				continue;
			}
			cleaned[id] = sanitized;
		}

		await setMigrated(cleaned);
		console.log(
			`[hotkeys] Migrated ${Object.keys(cleaned).length} override(s)` +
				(dropped > 0 ? `, dropped ${dropped} invalid` : ""),
		);
	} catch (error) {
		// Marker intentionally not set — transient tRPC failures retry next boot.
		console.log("[hotkeys] Migration failed, will retry next boot:", error);
	}
}
