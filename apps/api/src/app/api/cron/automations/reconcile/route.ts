import { dbWs } from "@superset/db/client";
import { automationRuns, automations } from "@superset/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { env } from "@/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STUCK_DISPATCHING_GRACE_MINUTES = 10;
const STALE_NEXT_RUN_ALERT_MINUTES = 60;

function authorized(request: Request): boolean {
	const header = request.headers.get("authorization");
	return header === `Bearer ${env.CRON_SECRET}`;
}

export async function POST(request: Request): Promise<Response> {
	if (!authorized(request)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const now = new Date();

	// 1. Stuck "dispatching" runs — dispatcher crashed after grabbing the row
	//    but before updating to "dispatched" or "dispatch_failed".
	const stuckCutoff = new Date(
		now.getTime() - STUCK_DISPATCHING_GRACE_MINUTES * 60_000,
	);
	const [stuckResult] = await dbWs
		.update(automationRuns)
		.set({
			status: "dispatch_failed",
			error: "dispatcher crashed mid-flight",
		})
		.where(
			and(
				eq(automationRuns.status, "dispatching"),
				lt(automationRuns.createdAt, stuckCutoff),
			),
		)
		.returning({ id: automationRuns.id });

	// 2. Automations whose next_run_at is far behind — dispatcher outage signal.
	//    Leave the row alone; just log so Sentry/Axiom surfaces it.
	const staleCutoff = new Date(
		now.getTime() - STALE_NEXT_RUN_ALERT_MINUTES * 60_000,
	);
	const stale = await dbWs
		.select({
			id: automations.id,
			nextRunAt: automations.nextRunAt,
		})
		.from(automations)
		.where(
			and(
				eq(automations.enabled, true),
				lt(automations.nextRunAt, staleCutoff),
			),
		)
		.limit(50);

	if (stale.length > 0) {
		console.warn(
			"[automations/reconcile] stale next_run_at (>1h behind)",
			stale.map((s) => s.id),
		);
	}

	return Response.json({
		stuckMarkedFailed: stuckResult ? 1 : 0,
		staleAutomations: stale.length,
	});
}
