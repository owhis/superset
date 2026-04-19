import { describe, expect, it } from "bun:test";
import { describeSchedule } from "./schedule-text";

const US = { locale: "en-US" };

describe("describeSchedule / MINUTELY + HOURLY", () => {
	it("every minute", () => {
		expect(describeSchedule("FREQ=MINUTELY", US)).toBe("Every minute");
	});

	it("every N minutes", () => {
		expect(describeSchedule("FREQ=MINUTELY;INTERVAL=15", US)).toBe(
			"Every 15 minutes",
		);
	});

	it("hourly", () => {
		expect(describeSchedule("FREQ=HOURLY", US)).toBe("Hourly");
	});

	it("every N hours", () => {
		expect(describeSchedule("FREQ=HOURLY;INTERVAL=2", US)).toBe(
			"Every 2 hours",
		);
	});
});

describe("describeSchedule / DAILY", () => {
	it("daily with time", () => {
		expect(describeSchedule("FREQ=DAILY;BYHOUR=9;BYMINUTE=0", US)).toBe(
			"Daily at 9:00 AM",
		);
	});

	it("daily without time", () => {
		expect(describeSchedule("FREQ=DAILY", US)).toBe("Daily");
	});

	it("every N days", () => {
		expect(describeSchedule("FREQ=DAILY;INTERVAL=3;BYHOUR=8", US)).toBe(
			"Every 3 days at 8:00 AM",
		);
	});
});

describe("describeSchedule / WEEKLY", () => {
	it("weekdays with time", () => {
		expect(
			describeSchedule(
				"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
				US,
			),
		).toBe("Weekdays at 9:00 AM");
	});

	it("weekdays regardless of BYDAY order", () => {
		expect(describeSchedule("FREQ=WEEKLY;BYDAY=FR,TH,WE,TU,MO", US)).toBe(
			"Weekdays",
		);
	});

	it("weekends", () => {
		expect(describeSchedule("FREQ=WEEKLY;BYDAY=SA,SU", US)).toBe("Weekends");
	});

	it("single day pluralized", () => {
		expect(
			describeSchedule("FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0", US),
		).toBe("Mondays at 10:00 AM");
	});

	it("multi-day list keeps canonical order", () => {
		expect(describeSchedule("FREQ=WEEKLY;BYDAY=FR,MO,WE", US)).toBe(
			"Mon, Wed, Fri",
		);
	});

	it("every 2 weeks on a specific day", () => {
		expect(
			describeSchedule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9", US),
		).toBe("Every 2 weeks on Monday at 9:00 AM");
	});

	it("every 2 weeks with multiple days → Custom", () => {
		expect(describeSchedule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", US)).toBe(
			"Custom",
		);
	});
});

describe("describeSchedule / MONTHLY + YEARLY", () => {
	it("first of each month", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=1", US)).toBe(
			"Monthly on the 1st",
		);
	});

	it("ordinal suffixes use correct teens", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=11", US)).toBe(
			"Monthly on the 11th",
		);
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=22", US)).toBe(
			"Monthly on the 22nd",
		);
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=23", US)).toBe(
			"Monthly on the 23rd",
		);
	});

	it("last day of month", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=-1", US)).toBe(
			"Last day of each month",
		);
	});

	it("annually", () => {
		expect(describeSchedule("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1", US)).toBe(
			"Annually on January 1",
		);
	});
});

describe("describeSchedule / locale", () => {
	it("renders 24h time when the locale asks for it", () => {
		expect(
			describeSchedule("FREQ=DAILY;BYHOUR=9;BYMINUTE=0", {
				locale: "en-GB",
			}),
		).toBe("Daily at 9:00");
	});
});

describe("describeSchedule / fallback to Custom", () => {
	it("returns Custom for BYSETPOS", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1", US)).toBe(
			"Custom",
		);
	});

	it("returns Custom for COUNT", () => {
		expect(describeSchedule("FREQ=DAILY;COUNT=5", US)).toBe("Custom");
	});

	it("returns Custom for UNTIL", () => {
		expect(describeSchedule("FREQ=DAILY;UNTIL=20260101T000000Z", US)).toBe(
			"Custom",
		);
	});

	it("returns Custom for empty or malformed rules", () => {
		expect(describeSchedule("", US)).toBe("Custom");
		expect(describeSchedule("FREQ", US)).toBe("Custom");
		expect(describeSchedule("NOTAKEY=VALUE", US)).toBe("Custom");
	});
});
