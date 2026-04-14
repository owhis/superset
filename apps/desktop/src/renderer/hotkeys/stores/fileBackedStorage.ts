/**
 * Custom Zustand StateStorage adapter that persists hotkey overrides to
 * ~/.superset/hotkey-overrides.json via tRPC IPC instead of browser
 * localStorage.  This ensures overrides survive app updates, Electron
 * partition resets, and "Clear browsing data" operations.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { StateStorage } from "zustand/middleware";

export const fileBackedStorage: StateStorage = {
	async getItem(name: string): Promise<string | null> {
		if (name !== "hotkey-overrides") return null;
		return electronTrpcClient.uiState.hotkeyOverrides.get.query();
	},

	async setItem(name: string, value: string): Promise<void> {
		if (name !== "hotkey-overrides") return;
		await electronTrpcClient.uiState.hotkeyOverrides.set.mutate({
			data: value,
		});
	},

	async removeItem(name: string): Promise<void> {
		if (name !== "hotkey-overrides") return;
		await electronTrpcClient.uiState.hotkeyOverrides.remove.mutate();
	},
};
