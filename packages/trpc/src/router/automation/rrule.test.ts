import { describe, expect, test } from "bun:test";
import { describeRrule, nextOccurrences, parseRrule } from "./rrule";

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
			const current = occurrences[i];
			const previous = occurrences[i - 1];
			if (!current || !previous) throw new Error("unexpected undefined");
			expect(current.getTime()).toBeGreaterThan(previous.getTime());
		}
	});
});
