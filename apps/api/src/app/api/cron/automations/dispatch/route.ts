import { TZDate } from "@date-fns/tz";
import { dbWs } from "@superset/db/client";
import { automations, type SelectAutomation } from "@superset/db/schema";
import { dispatchAutomation } from "@superset/trpc/automation-dispatch";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { RRule } from "rrule";
import { env } from "@/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DISPATCH_LOOKBACK_MINUTES = 5;
const DISPATCH_BATCH_SIZE = 1000;

function authorized(request: Request): boolean {
	const header = request.headers.get("authorization");
	return header === `Bearer ${env.CRON_SECRET}`;
}

function bucketToMinute(date: Date): Date {
	const copy = new Date(date.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

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

function advanceRrule(automation: SelectAutomation): Date | null {
	const rule = RRule.fromString(
		`DTSTART;TZID=${automation.timezone}:${formatRRuleLocalDtstart(
			automation.dtstart,
			automation.timezone,
		)}\nRRULE:${automation.rrule}`,
	);
	// rrule.after() compares against its own wall-clock-as-UTC space, so the
	// real-UTC nextRunAt needs projecting into that space first. Same trick
	// in reverse on the way out.
	const afterTz = new TZDate(
		automation.nextRunAt.getTime(),
		automation.timezone,
	);
	const afterForRrule = new Date(
		Date.UTC(
			afterTz.getFullYear(),
			afterTz.getMonth(),
			afterTz.getDate(),
			afterTz.getHours(),
			afterTz.getMinutes(),
			afterTz.getSeconds(),
		),
	);
	const next = rule.after(afterForRrule, false);
	if (!next) return null;
	return new TZDate(
		next.getUTCFullYear(),
		next.getUTCMonth(),
		next.getUTCDate(),
		next.getUTCHours(),
		next.getUTCMinutes(),
		next.getUTCSeconds(),
		automation.timezone,
	);
}

async function advanceNextRun(automation: SelectAutomation): Promise<void> {
	const next = advanceRrule(automation);
	if (next) {
		await dbWs
			.update(automations)
			.set({ nextRunAt: next })
			.where(eq(automations.id, automation.id));
	} else {
		await dbWs
			.update(automations)
			.set({ enabled: false })
			.where(eq(automations.id, automation.id));
	}
}

export async function POST(request: Request): Promise<Response> {
	if (!authorized(request)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const now = new Date();
	const lookbackStart = new Date(
		now.getTime() - DISPATCH_LOOKBACK_MINUTES * 60_000,
	);

	const due = await dbWs
		.select()
		.from(automations)
		.where(
			and(
				eq(automations.enabled, true),
				lte(automations.nextRunAt, now),
				gt(automations.nextRunAt, lookbackStart),
			),
		)
		.orderBy(automations.nextRunAt)
		.limit(DISPATCH_BATCH_SIZE);

	if (due.length === 0) {
		return Response.json({ dispatched: 0, failed: 0, skipped: 0 });
	}

	// Nudge nextRunAt forward so a second cron tick arriving mid-batch doesn't
	// re-select the same rows. advanceNextRun below will overwrite with the
	// real next occurrence once each automation finishes dispatching.
	const dueIds = due.map((a) => a.id);
	await dbWs
		.update(automations)
		.set({ nextRunAt: new Date(now.getTime() + 60_000) })
		.where(
			and(
				eq(automations.enabled, true),
				inArray(automations.id, dueIds),
				lte(automations.nextRunAt, now),
			),
		);

	const results = await Promise.allSettled(
		due.map(async (automation) => {
			try {
				await dispatchAutomation({
					automation,
					scheduledFor: bucketToMinute(automation.nextRunAt),
					relayUrl: env.RELAY_URL,
				});
			} finally {
				await advanceNextRun(automation);
			}
		}),
	);

	let dispatched = 0;
	let failed = 0;
	for (const result of results) {
		if (result.status === "fulfilled") {
			dispatched++;
		} else {
			failed++;
			console.error("[automations/dispatch]", result.reason);
		}
	}

	return Response.json({ dispatched, failed, total: due.length });
}
