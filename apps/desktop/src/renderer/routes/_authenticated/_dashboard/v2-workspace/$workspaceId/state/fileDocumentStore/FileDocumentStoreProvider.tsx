import { useWorkspaceClient } from "@superset/workspace-client";
import { type ReactNode, useEffect } from "react";
import {
	initializeFileDocumentStore,
	teardownFileDocumentStore,
} from "./fileDocumentStore";

interface FileDocumentStoreProviderProps {
	children: ReactNode;
}

export function FileDocumentStoreProvider({
	children,
}: FileDocumentStoreProviderProps) {
	const { trpcClient } = useWorkspaceClient();

	useEffect(() => {
		initializeFileDocumentStore({ trpcClient });
		return () => {
			teardownFileDocumentStore();
		};
	}, [trpcClient]);

	return <>{children}</>;
}
