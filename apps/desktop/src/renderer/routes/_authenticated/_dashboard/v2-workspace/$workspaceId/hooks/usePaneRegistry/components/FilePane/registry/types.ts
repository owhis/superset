import type { ComponentType } from "react";
import type { SharedFileDocument } from "../../../../../state/fileDocumentStore";

export type FileMeta = {
	size?: number;
	isBinary?: boolean;
};

export type DocumentKind = "text" | "bytes" | "custom";

// Priorities mirror VS Code's RegisteredEditorPriority
// (editorResolverService.ts). Ranking: exclusive > default > builtin > option.
export type Priority = "builtin" | "option" | "default" | "exclusive";

export const PRIORITY_RANK: Record<Priority, number> = {
	exclusive: 5,
	default: 4,
	builtin: 3,
	option: 1,
};

export interface FileView {
	id: string;
	label: string;
	match: (filePath: string, meta: FileMeta) => boolean;
	priority: Priority;
	documentKind: DocumentKind;
	Renderer: ComponentType<ViewProps>;
}

export interface ViewProps {
	document: SharedFileDocument;
	filePath: string;
	workspaceId: string;
}
