export type ContentState =
	| { kind: "loading" }
	| { kind: "text"; value: string; revision: string }
	| { kind: "bytes"; value: Uint8Array; revision: string }
	| { kind: "not-found" }
	| { kind: "too-large" }
	| { kind: "is-directory" };

export type SaveResult =
	| { status: "saved"; revision: string }
	| { status: "conflict" }
	| { status: "not-found" }
	| { status: "exists" }
	| { status: "error"; error: Error };

export interface SharedFileDocument {
	readonly workspaceId: string;
	readonly absolutePath: string;

	readonly content: ContentState;
	readonly dirty: boolean;

	setContent(next: string): void;
	save(opts?: { force?: boolean }): Promise<SaveResult>;
	reload(): Promise<void>;

	subscribe(listener: () => void): () => void;
	getVersion(): number;
}
