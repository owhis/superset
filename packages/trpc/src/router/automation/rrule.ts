import { TZDate } from "@date-fns/tz";
import { RRule } from "rrule";

export interface ParsedRecurrence {
	rrule: string;
	dtstart: Date;
	timezone: string;
	nextRunAt: Date;
}

/**
 * rrule.js internals treat `TZID` occurrences as "wall-clock in the zone,
 * represented as UTC digits" — the Date objects you get in/out of `rule.after`
 * etc. are NOT real UTC instants. Converting in both directions around every
 * rrule call keeps real UTC everywhere else.
 */
export function rruleDateToUtc(rruleDate: Date, timezone: string): Date {
	// rruleDate.getUTCFoo() digits = wall-clock in `timezone`.
	// Construct a TZDate with those digits in the zone → real UTC.
	return new TZDate(
		rruleDate.getUTCFullYear(),
		rruleDate.getUTCMonth(),
		rruleDate.getUTCDate(),
		rruleDate.getUTCHours(),
		rruleDate.getUTCMinutes(),
		rruleDate.getUTCSeconds(),
		timezone,
	);
}

export function utcToRruleDate(realUtc: Date, timezone: string): Date {
	// realUtc is a true instant; project its wall-clock in `timezone` back
	// into a Date whose UTC digits match that wall-clock (rrule input space).
	const tz = new TZDate(realUtc.getTime(), timezone);
	return new Date(
		Date.UTC(
			tz.getFullYear(),
			tz.getMonth(),
			tz.getDate(),
			tz.getHours(),
			tz.getMinutes(),
			tz.getSeconds(),
		),
	);
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
	const after = utcToRruleDate(args.after ?? new Date(), args.timezone);
	const next = rule.after(after, false);
	if (!next) {
		throw new Error("Recurrence has no future occurrences");
	}
	return {
		rrule: args.rrule,
		dtstart: args.dtstart,
		timezone: args.timezone,
		nextRunAt: rruleDateToUtc(next, args.timezone),
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
	let cursor = utcToRruleDate(args.after ?? new Date(), args.timezone);
	for (let i = 0; i < args.count; i++) {
		const next = rule.after(cursor, false);
		if (!next) break;
		results.push(rruleDateToUtc(next, args.timezone));
		cursor = next;
	}
	return results;
}
