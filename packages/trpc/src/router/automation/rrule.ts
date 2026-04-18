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

