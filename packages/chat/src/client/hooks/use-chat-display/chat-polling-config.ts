/**
 * Chat polling configuration.
 *
 * Controls how aggressively the chat display hooks poll for updates.
 * Extracted for testability — the previous inline config polled at 60 fps
 * (every ~16 ms) with zero cache retention and background polling enabled,
 * which inflated the V8 heap baseline even when the workspace was idle.
 */

/** Convert a frames-per-second value to a millisecond refetch interval. */
export function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

/** Default FPS when the agent is actively running (streaming output). */
export const ACTIVE_FPS = 10;

/** Default FPS when the agent is idle (no streaming). */
export const IDLE_FPS = 2;

/**
 * Build the React Query options for chat display polling.
 *
 * Uses an adaptive refetch interval: fast when the agent is streaming,
 * slow when idle. Background polling is disabled so hidden workspaces
 * don't burn CPU/memory.
 */
export function getChatPollingQueryOptions(opts: {
	enabled: boolean;
	activeFps?: number;
	idleFps?: number;
}) {
	const { enabled, activeFps = ACTIVE_FPS, idleFps = IDLE_FPS } = opts;

	const activeIntervalMs = toRefetchIntervalMs(activeFps);
	const idleIntervalMs = toRefetchIntervalMs(idleFps);

	return {
		enabled,
		refetchInterval: ({
			state,
		}: {
			state: { data?: { isRunning?: boolean } | unknown };
		}) => {
			const data = state.data as { isRunning?: boolean } | undefined;
			if (data && "isRunning" in data && data.isRunning) {
				return activeIntervalMs;
			}
			return idleIntervalMs;
		},
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		staleTime: 200,
		gcTime: 5_000,
	} as const;
}

/**
 * Build query options for a messages query that doesn't carry `isRunning`.
 *
 * Accepts a getter so it can piggyback on the display-state query's
 * running flag without duplicating the adaptive logic.
 */
export function getChatMessagesQueryOptions(opts: {
	enabled: boolean;
	isRunningGetter: () => boolean;
	activeFps?: number;
	idleFps?: number;
}) {
	const {
		enabled,
		isRunningGetter,
		activeFps = ACTIVE_FPS,
		idleFps = IDLE_FPS,
	} = opts;

	const activeIntervalMs = toRefetchIntervalMs(activeFps);
	const idleIntervalMs = toRefetchIntervalMs(idleFps);

	return {
		enabled,
		refetchInterval: () => {
			return isRunningGetter() ? activeIntervalMs : idleIntervalMs;
		},
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		staleTime: 200,
		gcTime: 5_000,
	} as const;
}
