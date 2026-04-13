import { describe, expect, it } from "bun:test";
import {
	ACTIVE_FPS,
	getChatMessagesQueryOptions,
	getChatPollingQueryOptions,
	IDLE_FPS,
	toRefetchIntervalMs,
} from "./chat-polling-config";

describe("toRefetchIntervalMs", () => {
	it("converts fps to a millisecond interval", () => {
		expect(toRefetchIntervalMs(10)).toBe(100);
		expect(toRefetchIntervalMs(2)).toBe(500);
		expect(toRefetchIntervalMs(1)).toBe(1000);
	});

	it("clamps to a 16ms floor (≈60fps)", () => {
		expect(toRefetchIntervalMs(120)).toBe(16);
		expect(toRefetchIntervalMs(60)).toBe(16);
	});

	it("falls back to ~60fps for invalid inputs", () => {
		expect(toRefetchIntervalMs(0)).toBe(16);
		expect(toRefetchIntervalMs(-1)).toBe(16);
		expect(toRefetchIntervalMs(Number.NaN)).toBe(16);
		expect(toRefetchIntervalMs(Number.POSITIVE_INFINITY)).toBe(16);
	});
});

describe("getChatPollingQueryOptions", () => {
	it("does NOT poll in the background (idle workspaces should not burn memory)", () => {
		const opts = getChatPollingQueryOptions({ enabled: true });
		expect(opts.refetchIntervalInBackground).toBe(false);
	});

	it("uses a non-zero staleTime so React Query can de-dup rapid refetches", () => {
		const opts = getChatPollingQueryOptions({ enabled: true });
		expect(opts.staleTime).toBeGreaterThan(0);
	});

	it("uses a non-zero gcTime so completed queries aren't immediately GC'd", () => {
		const opts = getChatPollingQueryOptions({ enabled: true });
		expect(opts.gcTime).toBeGreaterThan(0);
	});

	it("uses an adaptive refetch interval — fast when running, slow when idle", () => {
		const opts = getChatPollingQueryOptions({ enabled: true });
		expect(typeof opts.refetchInterval).toBe("function");

		const intervalFn = opts.refetchInterval as (ctx: {
			state: { data?: unknown };
		}) => number;

		const idleInterval = intervalFn({ state: { data: { isRunning: false } } });
		const activeInterval = intervalFn({
			state: { data: { isRunning: true } },
		});
		const noDataInterval = intervalFn({ state: { data: undefined } });

		// Active interval should be faster (smaller) than idle
		expect(activeInterval).toBeLessThan(idleInterval);

		// Idle interval should be ≥ 200ms (≤5fps) to avoid unnecessary polling
		expect(idleInterval).toBeGreaterThanOrEqual(200);

		// Active interval should be ≤ 200ms for responsive streaming
		expect(activeInterval).toBeLessThanOrEqual(200);

		// No data defaults to idle speed
		expect(noDataInterval).toBe(idleInterval);
	});
});

describe("getChatMessagesQueryOptions", () => {
	it("does NOT poll in the background", () => {
		const opts = getChatMessagesQueryOptions({
			enabled: true,
			isRunningGetter: () => false,
		});
		expect(opts.refetchIntervalInBackground).toBe(false);
	});

	it("adapts polling speed based on the isRunning getter", () => {
		let running = false;
		const opts = getChatMessagesQueryOptions({
			enabled: true,
			isRunningGetter: () => running,
		});

		const intervalFn = opts.refetchInterval as () => number;

		const idleInterval = intervalFn();
		running = true;
		const activeInterval = intervalFn();

		expect(activeInterval).toBeLessThan(idleInterval);
		expect(idleInterval).toBeGreaterThanOrEqual(200);
	});
});

describe("default FPS constants", () => {
	it("ACTIVE_FPS produces a responsive interval (≤200ms)", () => {
		expect(toRefetchIntervalMs(ACTIVE_FPS)).toBeLessThanOrEqual(200);
	});

	it("IDLE_FPS produces a conservative interval (≥200ms)", () => {
		expect(toRefetchIntervalMs(IDLE_FPS)).toBeGreaterThanOrEqual(200);
	});

	it("IDLE_FPS is much lower than the previous 60fps default", () => {
		const oldInterval = toRefetchIntervalMs(60);
		const newIdleInterval = toRefetchIntervalMs(IDLE_FPS);
		expect(newIdleInterval).toBeGreaterThanOrEqual(oldInterval * 10);
	});
});
