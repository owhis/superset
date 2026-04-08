import { env } from "renderer/env.renderer";

export type WorkspaceHostTarget =
	| { kind: "local" }
	| { kind: "cloud" }
	| { kind: "host"; hostId: string };

export function getCloudWorkspaceHostUrl(): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/hosts/cloud/trpc`;
}

export function getRemoteHostUrl(hostId: string): string | null {
	if (!env.RELAY_URL) return null;
	return `${env.RELAY_URL}/hosts/${hostId}`;
}

export function resolveCreateWorkspaceHostUrl(
	target: WorkspaceHostTarget,
	localHostUrl: string | null,
): string | null {
	switch (target.kind) {
		case "local":
			return localHostUrl;
		case "cloud":
			return getCloudWorkspaceHostUrl();
		case "host":
			return getRemoteHostUrl(target.hostId);
	}
}
