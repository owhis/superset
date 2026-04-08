import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import {
	getHostServiceClient,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { MOCK_ORG_ID } from "shared/constants";
import { useCollections } from "../CollectionsProvider";

export interface OrgService {
	port: number;
	url: string;
	client: HostServiceClient;
}

interface HostServiceContextValue {
	services: Map<string, OrgService>;
}

const HostServiceContext = createContext<HostServiceContextValue | null>(null);

export function HostServiceProvider({ children }: { children: ReactNode }) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const startMutation = electronTrpc.hostServiceCoordinator.start.useMutation();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const orgIds = useMemo(
		() => organizations?.map((o) => o.id) ?? [],
		[organizations],
	);

	// Start a host service for every org
	useEffect(() => {
		for (const orgId of orgIds) {
			startMutation.mutate({ organizationId: orgId });
		}
	}, [orgIds, startMutation.mutate]);

	// Query active org's connection
	const { data: activeConnection } =
		electronTrpc.hostServiceCoordinator.getConnection.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: !!activeOrganizationId, refetchInterval: 5_000 },
		);

	// Build the services map
	const services = useMemo(() => {
		const map = new Map<string, OrgService>();

		if (activeOrganizationId && activeConnection?.port) {
			const url = `http://127.0.0.1:${activeConnection.port}`;
			if (activeConnection.secret) {
				setHostServiceSecret(url, activeConnection.secret);
			}
			map.set(activeOrganizationId, {
				port: activeConnection.port,
				url,
				client: getHostServiceClient(activeConnection.port),
			});
		}

		return map;
	}, [activeOrganizationId, activeConnection]);

	const value = useMemo(() => ({ services }), [services]);

	return (
		<HostServiceContext.Provider value={value}>
			{children}
		</HostServiceContext.Provider>
	);
}

export function useHostService(): HostServiceContextValue {
	const context = useContext(HostServiceContext);
	if (!context) {
		throw new Error("useHostService must be used within HostServiceProvider");
	}
	return context;
}
