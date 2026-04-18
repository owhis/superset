import cronParser from "cron-parser";
import { RRule } from "rrule";

export interface ParsedRecurrence {
	rrule: string;
	dtstart: Date;
	timezone: string;
	nextRunAt: Date;
}

/**
 * Serialize a Date into the local wall-clock string format RRule requires
 * (YYYYMMDDTHHMMSS), given an IANA timezone.
 *
 * rrule.js expects DTSTART to be expressed in the TZID's local time, not UTC.
 */
function formatRRuleLocalDtstart(dtstart: Date, timezone: string): string {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(dtstart).map((p) => [p.type, p.value]),
	);
	return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function buildRuleString(
	rrule: string,
	dtstart: Date,
	timezone: string,
): string {
	return `DTSTART;TZID=${timezone}:${formatRRuleLocalDtstart(dtstart, timezone)}\nRRULE:${rrule}`;
}

/** Parses + validates an RRule body, returning the next occurrence. */
export function parseRrule(args: {
	rrule: string;
	dtstart: Date;
	timezone: string;
	after?: Date;
}): ParsedRecurrence {
	const rule = RRule.fromString(
		buildRuleString(args.rrule, args.dtstart, args.timezone),
	);
	const next = rule.after(args.after ?? new Date(), false);
	if (!next) {
		throw new Error("Recurrence has no future occurrences");
	}
	return {
		rrule: args.rrule,
		dtstart: args.dtstart,
		timezone: args.timezone,
		nextRunAt: next,
	};
}

/** Human-readable description of a recurrence ("every weekday at 9 AM"). */
export function describeRrule(args: {
	rrule: string;
	dtstart: Date;
	timezone: string;
}): string {
	const rule = RRule.fromString(
		buildRuleString(args.rrule, args.dtstart, args.timezone),
	);
	return rule.toText();
}

/** Next N upcoming occurrences, for the create-modal preview. */
export function nextOccurrences(args: {
	rrule: string;
	dtstart: Date;
	timezone: string;
	count: number;
	after?: Date;
}): Date[] {
	const rule = RRule.fromString(
		buildRuleString(args.rrule, args.dtstart, args.timezone),
	);
	const results: Date[] = [];
	let cursor = args.after ?? new Date();
	for (let i = 0; i < args.count; i++) {
		const next = rule.after(cursor, false);
		if (!next) break;
		results.push(next);
		cursor = next;
	}
	return results;
}

/**
 * Convert a cron expression to the closest RRule equivalent for the shared
 * cases our users pick (daily, weekdays, weekly, monthly, "every N minutes").
 * Uses cron-parser to validate.
 */
export function cronToRrule(cron: string): string {
	// Validate + iterate once to confirm the expression parses.
	const iter = cronParser.parse(cron, {
		currentDate: new Date(),
	});
	iter.next();

	const parts = cron.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(
			"Only standard 5-field cron expressions are supported (minute hour day month weekday).",
		);
	}
	const [minute, hour, dom, month, dow] = parts;

	// Special-case common patterns with a clean RRule. Fallback builds a
	// generic RRule from the five fields.
	if (
		minute === "*" &&
		hour === "*" &&
		dom === "*" &&
		month === "*" &&
		dow === "*"
	) {
		return "FREQ=MINUTELY";
	}

	// */N minutes (e.g. "*/5 * * * *")
	const stepMinuteMatch = minute?.match(/^\*\/(\d+)$/);
	if (
		stepMinuteMatch &&
		hour === "*" &&
		dom === "*" &&
		month === "*" &&
		dow === "*"
	) {
		return `FREQ=MINUTELY;INTERVAL=${stepMinuteMatch[1]}`;
	}

	const segments: string[] = [];

	if (dow && dow !== "*") {
		// Weekly — BYDAY
		segments.push("FREQ=WEEKLY", `BYDAY=${mapDayOfWeek(dow)}`);
	} else if (dom && dom !== "*") {
		// Monthly — BYMONTHDAY
		segments.push("FREQ=MONTHLY", `BYMONTHDAY=${dom}`);
	} else if (hour && hour !== "*") {
		segments.push("FREQ=DAILY");
	} else {
		segments.push("FREQ=HOURLY");
	}

	if (hour && hour !== "*") segments.push(`BYHOUR=${hour}`);
	if (minute && minute !== "*") segments.push(`BYMINUTE=${minute}`);
	if (month && month !== "*") segments.push(`BYMONTH=${month}`);

	return segments.join(";");
}

/**
 * Maps cron day-of-week tokens (0/7 = Sunday, 1 = Monday, ...) to RRule BYDAY
 * tokens (MO, TU, WE, ...).
 */
function mapDayOfWeek(dow: string): string {
	const dayMap: Record<string, string> = {
		"0": "SU",
		"1": "MO",
		"2": "TU",
		"3": "WE",
		"4": "TH",
		"5": "FR",
		"6": "SA",
		"7": "SU",
		SUN: "SU",
		MON: "MO",
		TUE: "TU",
		WED: "WE",
		THU: "TH",
		FRI: "FR",
		SAT: "SA",
	};

	return dow
		.split(",")
		.flatMap((token) => {
			const normalized = token.toUpperCase().trim();
			const rangeMatch = normalized.match(/^(\w+)-(\w+)$/);
			if (rangeMatch) {
				const weekOrder = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
				const rangeStart = rangeMatch[1];
				const rangeEnd = rangeMatch[2];
				if (!rangeStart || !rangeEnd) return [];
				const start = dayMap[rangeStart] ?? rangeStart;
				const end = dayMap[rangeEnd] ?? rangeEnd;
				if (!start || !end) return [];
				const startIdx = weekOrder.indexOf(start);
				const endIdx = weekOrder.indexOf(end);
				if (startIdx < 0 || endIdx < 0) return [];
				if (startIdx <= endIdx) return weekOrder.slice(startIdx, endIdx + 1);
				return [
					...weekOrder.slice(startIdx),
					...weekOrder.slice(0, endIdx + 1),
				];
			}
			const mapped = dayMap[normalized];
			return mapped ? [mapped] : [];
		})
		.join(",");
}
