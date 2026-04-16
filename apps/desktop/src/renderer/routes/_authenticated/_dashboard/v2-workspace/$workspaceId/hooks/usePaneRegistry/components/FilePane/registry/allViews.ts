import type { FileView } from "./types";
import { codeView } from "./views/CodeView";

// Order is preserved as a stable tiebreaker for equal-priority views.
// PR 1 ships only the code view; markdown/image/binary views arrive in later PRs.
export const ALL_VIEWS: FileView[] = [codeView];
