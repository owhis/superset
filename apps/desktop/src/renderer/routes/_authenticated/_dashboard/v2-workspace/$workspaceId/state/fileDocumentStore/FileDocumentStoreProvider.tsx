import { useWorkspaceClient } from "@superset/workspace-client";
import { type ReactNode, useEffect } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import {
	dispatchFsEvent,
	initializeFileDocumentStore,
	teardownFileDocumentStore,
} from "./fileDocumentStore";

interface FileDocumentStoreProviderProps {
	workspaceId: string;
	children: ReactNode;
}

export function FileDocumentStoreProvider({
	workspaceId,
	children,
}: FileDocumentStoreProviderProps) {
	const { trpcClient } = useWorkspaceClient();

	useEffect(() => {
		initializeFileDocumentStore({ trpcClient });
		return () => {
			teardownFileDocumentStore();
		};
	}, [trpcClient]);

	useWorkspaceEvent("fs:events", workspaceId, (event) => {
		dispatchFsEvent(workspaceId, event);
	});

	return <>{children}</>;
}
