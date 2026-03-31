import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { syncGithubInstallation } from "../sync-installation";

const bodySchema = z.object({
	organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
	if (env.NODE_ENV !== "development") {
		return Response.json(
			{ error: "This endpoint is only available in development" },
			{ status: 403 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId } = parsed.data;

	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId))
		.limit(1);

	if (!installation) {
		return Response.json({ error: "Installation not found" }, { status: 404 });
	}

	try {
		const result = await syncGithubInstallation({
			installationDbId: installation.id,
			githubInstallationId: installation.installationId,
			organizationId,
			logPrefix: "github/sync",
		});

		return Response.json({
			success: true,
			repositoriesCount: result.repositoriesCount,
		});
	} catch (error) {
		console.error("[github/sync] Sync failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Sync failed" },
			{ status: 500 },
		);
	}
}
