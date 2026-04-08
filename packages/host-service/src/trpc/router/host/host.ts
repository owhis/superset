import os from "node:os";
import { TRPCError } from "@trpc/server";
import { getDeviceName, getHashedDeviceId } from "../../../device-info";
import type { ApiClient } from "../../../types";
import { protectedProcedure, router } from "../../index";

const HOST_SERVICE_VERSION = "0.1.0";
const _processStartedAt = Date.now();

let cachedOrganization: {
	id: string;
	name: string;
	slug: string;
} | null = null;

async function getOrganization(
	api: ApiClient,
): Promise<{ id: string; name: string; slug: string }> {
	if (cachedOrganization) return cachedOrganization;

	const organization = await api.organization.getActive.query();
	if (!organization) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "No active organization",
		});
	}

	cachedOrganization = organization;
	return organization;
}

export const hostRouter = router({
	info: protectedProcedure.query(async ({ ctx }) => {
		const api = (ctx as { api: ApiClient }).api;
		const organization = await getOrganization(api);

		return {
			hostId: getHashedDeviceId(),
			hostName: getDeviceName(),
			version: HOST_SERVICE_VERSION,
			organization,
			platform: os.platform(),
			uptime: process.uptime(),
		};
	}),
});
