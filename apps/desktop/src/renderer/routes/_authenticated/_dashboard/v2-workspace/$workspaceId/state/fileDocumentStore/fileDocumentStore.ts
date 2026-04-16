import type { workspaceTrpc } from "@superset/workspace-client";
import type { ContentState, SaveResult, SharedFileDocument } from "./types";

type WorkspaceTrpcClient = ReturnType<typeof workspaceTrpc.createClient>;

interface DocumentEntry {
	workspaceId: string;
	absolutePath: string;
	content: ContentState;
	savedContentText: string | null;
	refCount: number;
	version: number;
	subscribers: Set<() => void>;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

let activeTrpcClient: WorkspaceTrpcClient | null = null;
const entries = new Map<string, DocumentEntry>();

function key(workspaceId: string, absolutePath: string): string {
	return `${workspaceId}:${absolutePath}`;
}

function notify(entry: DocumentEntry): void {
	entry.version += 1;
	for (const listener of entry.subscribers) {
		listener();
	}
}

function computeDirty(entry: DocumentEntry): boolean {
	if (entry.content.kind !== "text") return false;
	if (entry.savedContentText === null) return false;
	return entry.content.value !== entry.savedContentText;
}

function requireClient(): WorkspaceTrpcClient {
	if (!activeTrpcClient) {
		throw new Error(
			"fileDocumentStore accessed before initialization; ensure FileDocumentStoreProvider is mounted",
		);
	}
	return activeTrpcClient;
}

export function initializeFileDocumentStore(config: {
	trpcClient: WorkspaceTrpcClient;
}): void {
	activeTrpcClient = config.trpcClient;
}

export function teardownFileDocumentStore(): void {
	activeTrpcClient = null;
	entries.clear();
}

async function loadEntry(entry: DocumentEntry): Promise<void> {
	const client = requireClient();
	try {
		const result = await client.filesystem.readFile.query({
			workspaceId: entry.workspaceId,
			absolutePath: entry.absolutePath,
			encoding: "utf-8",
			maxBytes: DEFAULT_MAX_BYTES,
		});

		if (result.exceededLimit) {
			entry.content = { kind: "too-large" };
			notify(entry);
			return;
		}

		if (result.kind === "text") {
			entry.content = {
				kind: "text",
				value: result.content,
				revision: result.revision,
			};
			entry.savedContentText = result.content;
			notify(entry);
			return;
		}

		// PR 1 only renders text. Byte-capable views (image, binary) arrive in PR 2.
		// Placeholder value; FilePane gates on `kind === "bytes"` and shows an error state.
		entry.content = {
			kind: "bytes",
			value: new Uint8Array(),
			revision: result.revision,
		};
		notify(entry);
	} catch {
		entry.content = { kind: "not-found" };
		notify(entry);
	}
}

function createHandle(entry: DocumentEntry): SharedFileDocument {
	return {
		get workspaceId() {
			return entry.workspaceId;
		},
		get absolutePath() {
			return entry.absolutePath;
		},
		get content() {
			return entry.content;
		},
		get dirty() {
			return computeDirty(entry);
		},
		setContent(next) {
			if (entry.content.kind !== "text") return;
			if (entry.content.value === next) return;
			entry.content = { ...entry.content, value: next };
			notify(entry);
		},
		async save(opts): Promise<SaveResult> {
			if (entry.content.kind !== "text") {
				return {
					status: "error",
					error: new Error("Cannot save non-text content"),
				};
			}
			const client = requireClient();
			const currentValue = entry.content.value;
			const currentRevision = entry.content.revision;
			try {
				const result = await client.filesystem.writeFile.mutate({
					workspaceId: entry.workspaceId,
					absolutePath: entry.absolutePath,
					content: currentValue,
					encoding: "utf-8",
					precondition:
						opts?.force || !currentRevision
							? undefined
							: { ifMatch: currentRevision },
				});

				if (!result.ok) {
					if (result.reason === "conflict") {
						return { status: "conflict" };
					}
					return { status: result.reason };
				}

				entry.content = {
					kind: "text",
					value: currentValue,
					revision: result.revision,
				};
				entry.savedContentText = currentValue;
				notify(entry);
				return { status: "saved", revision: result.revision };
			} catch (error) {
				return { status: "error", error: error as Error };
			}
		},
		async reload() {
			entry.content = { kind: "loading" };
			entry.savedContentText = null;
			notify(entry);
			await loadEntry(entry);
		},
		subscribe(listener) {
			entry.subscribers.add(listener);
			return () => {
				entry.subscribers.delete(listener);
			};
		},
		getVersion() {
			return entry.version;
		},
	};
}

export function acquireDocument(
	workspaceId: string,
	absolutePath: string,
): SharedFileDocument {
	const k = key(workspaceId, absolutePath);
	let entry = entries.get(k);
	if (!entry) {
		entry = {
			workspaceId,
			absolutePath,
			content: { kind: "loading" },
			savedContentText: null,
			refCount: 0,
			version: 0,
			subscribers: new Set(),
		};
		entries.set(k, entry);
		void loadEntry(entry);
	}
	entry.refCount += 1;
	return createHandle(entry);
}

export function releaseDocument(
	workspaceId: string,
	absolutePath: string,
): void {
	const k = key(workspaceId, absolutePath);
	const entry = entries.get(k);
	if (!entry) return;
	entry.refCount -= 1;
	if (entry.refCount <= 0 && !computeDirty(entry)) {
		entries.delete(k);
	}
}
