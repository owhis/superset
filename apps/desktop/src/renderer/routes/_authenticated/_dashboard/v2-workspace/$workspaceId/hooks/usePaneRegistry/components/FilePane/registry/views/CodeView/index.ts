import type { FileView } from "../../types";
import { CodeView } from "./CodeView";

export const codeView: FileView = {
	id: "code",
	label: "Code",
	match: () => true,
	priority: "builtin",
	documentKind: "text",
	Renderer: CodeView,
};
