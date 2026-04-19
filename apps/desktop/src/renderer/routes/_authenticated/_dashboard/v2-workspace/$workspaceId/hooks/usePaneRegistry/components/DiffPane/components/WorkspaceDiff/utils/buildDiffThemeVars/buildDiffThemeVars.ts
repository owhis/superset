import type { CSSProperties } from "react";
import { getDiffViewerStyle } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import type { Theme } from "shared/themes";

interface DiffThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export function buildDiffThemeVars(
	theme: Theme,
	fontSettings: DiffThemeFontSettings,
): CSSProperties {
	return getDiffViewerStyle(theme, fontSettings);
}
