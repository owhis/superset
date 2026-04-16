import { useEffect, useState, useSyncExternalStore } from "react";
import { acquireDocument, releaseDocument } from "./fileDocumentStore";
import type { SharedFileDocument } from "./types";

interface UseSharedFileDocumentParams {
	workspaceId: string;
	absolutePath: string;
}

export function useSharedFileDocument({
	workspaceId,
	absolutePath,
}: UseSharedFileDocumentParams): SharedFileDocument {
	const [handle] = useState<SharedFileDocument>(() =>
		acquireDocument(workspaceId, absolutePath),
	);

	useEffect(() => {
		return () => {
			releaseDocument(workspaceId, absolutePath);
		};
	}, [workspaceId, absolutePath]);

	useSyncExternalStore(handle.subscribe, handle.getVersion, handle.getVersion);

	return handle;
}
