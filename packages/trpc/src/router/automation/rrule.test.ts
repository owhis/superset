import { describe, expect, test } from "bun:test";
import { cronToRrule, describeRrule, nextOccurrences, parseRrule } from "./rrule";

describe("cronToRrule", () => {
	test("every 2 minutes", () => {
		expect(cronToRrule("*/2 * * * *")).toBe("FREQ=MINUTELY;INTERVAL=2");
	});

	test("daily at 9", () => {
		expect(cronToRrule("0 9 * * *")).toBe("FREQ=DAILY;BYHOUR=9;BYMINUTE=0");
	});

	test("weekdays at 9", () => {
		expect(cronToRrule("0 9 * * 1-5")).toBe(
			"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
		);
	});

	test("monthly on the 1st at 9", () => {
		expect(cronToRrule("0 9 1 * *")).toBe(
			"FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0",
		);
	});

	test("rejects non-standard cron", () => {
		expect(() => cronToRrule("0 9")).toThrow();
		expect(() => cronToRrule("bogus")).toThrow();
	});
});

describe("parseRrule", () => {
	test("returns a future next occurrence", () => {
		const now = new Date();
		const result = parseRrule({
			rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
			dtstart: new Date(now.getTime() - 86_400_000),
			timezone: "America/Los_Angeles",
			after: now,
		});
		expect(result.nextRunAt.getTime()).toBeGreaterThan(now.getTime());
	});

	test("rejects recurrences with no future occurrences (UNTIL in the past)", () => {
		const past = new Date("2020-01-01T00:00:00Z");
		expect(() =>
			parseRrule({
				rrule: "FREQ=DAILY;UNTIL=20200102T000000Z",
				dtstart: past,
				timezone: "UTC",
			}),
		).toThrow();
	});
});

describe("describeRrule", () => {
	test("produces human-readable output", () => {
		const text = describeRrule({
			rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0",
			dtstart: new Date("2026-04-17T00:00:00Z"),
			timezone: "America/Los_Angeles",
		});
		expect(text.toLowerCase()).toContain("friday");
	});
});

describe("nextOccurrences", () => {
	test("returns the requested count", () => {
		const occurrences = nextOccurrences({
			rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
			dtstart: new Date("2026-01-01T00:00:00Z"),
			timezone: "UTC",
			count: 5,
			after: new Date("2026-04-01T00:00:00Z"),
		});
		expect(occurrences).toHaveLength(5);
		for (let i = 1; i < occurrences.length; i++) {
			expect(occurrences[i]!.getTime()).toBeGreaterThan(
				occurrences[i - 1]!.getTime(),
			);
		}
	});
});
