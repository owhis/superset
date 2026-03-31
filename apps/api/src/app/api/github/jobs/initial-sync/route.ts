import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { syncGithubInstallation } from "../../sync-installation";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	installationDbId: z.string().uuid(),
	organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}

		const isValid = await receiver
			.verify({
				body,
				signature,
				url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
			})
			.catch((error) => {
				console.error(
					"[github/initial-sync] Signature verification failed:",
					error,
				);
				return false;
			});

		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	let bodyData: unknown;
	try {
		bodyData = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(bodyData);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { installationDbId, organizationId } = parsed.data;

	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.id, installationDbId))
		.limit(1);

	if (!installation) {
		return Response.json(
			{ error: "Installation not found", skipped: true },
			{ status: 404 },
		);
	}

	try {
		await syncGithubInstallation({
			installationDbId,
			githubInstallationId: installation.installationId,
			organizationId,
			logPrefix: "github/initial-sync",
		});

		return Response.json({ success: true });
	} catch (error) {
		console.error("[github/initial-sync] Sync failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Sync failed" },
			{ status: 500 },
		);
	}
}
