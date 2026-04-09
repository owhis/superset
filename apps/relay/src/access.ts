import { db } from "@superset/db/client";
import { v2UsersHosts } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

export async function checkHostAccess(
	userId: string,
	hostId: string,
): Promise<boolean> {
	const row = await db.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, hostId),
		),
		columns: { id: true },
	});

	return !!row;
}
