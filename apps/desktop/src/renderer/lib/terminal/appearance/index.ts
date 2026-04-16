import type { ITheme } from "@xterm/xterm";
import { toXtermTheme } from "renderer/stores/theme/utils";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
} from "shared/themes";

export interface TerminalAppearance {
	theme: ITheme;
	background: string;
	fontFamily: string;
	fontSize: number;
}

const GENERIC_FONT_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-serif",
	"ui-sans-serif",
	"ui-monospace",
	"ui-rounded",
	"emoji",
	"math",
	"fangsong",
]);

function serializeFontFamilyList(families: string[]): string {
	return families
		.map((family) =>
			GENERIC_FONT_FAMILIES.has(family)
				? family
				: `"${family.replaceAll('"', '\\"')}"`,
		)
		.join(", ");
}

export const DEFAULT_TERMINAL_FONT_FAMILIES = [
	"JetBrains Mono",
	"JetBrainsMono Nerd Font",
	"MesloLGM Nerd Font",
	"MesloLGM NF",
	"MesloLGS NF",
	"MesloLGS Nerd Font",
	"Hack Nerd Font",
	"FiraCode Nerd Font",
	"CaskaydiaCove Nerd Font",
	"Menlo",
	"Monaco",
	"Courier New",
	"monospace",
] as const;

export const DEFAULT_TERMINAL_FONT_FAMILY = serializeFontFamilyList([
	...DEFAULT_TERMINAL_FONT_FAMILIES,
]);

export const DEFAULT_TERMINAL_FONT_SIZE = 14;

/**
 * Combine a user-chosen terminal font with the default monospace fallback
 * chain. The user's font is preferred, but a generic `monospace` fallback
 * is always present so a non-monospace or missing font cannot leave xterm
 * with broken metrics and render the app unusable (see #3513).
 */
export function resolveTerminalFontFamily(
	userFontFamily: string | null | undefined,
): string {
	const trimmed = userFontFamily?.trim();
	if (!trimmed) return DEFAULT_TERMINAL_FONT_FAMILY;
	const normalized = trimmed.toLowerCase();
	const fallback = DEFAULT_TERMINAL_FONT_FAMILIES.find(
		(family) => family.toLowerCase() === normalized,
	);
	if (fallback) return DEFAULT_TERMINAL_FONT_FAMILY;
	return `${serializeFontFamilyList([trimmed])}, ${DEFAULT_TERMINAL_FONT_FAMILY}`;
}

/** Reads localStorage theme cache for flash-free first paint. */
export function getDefaultTerminalAppearance(): TerminalAppearance {
	const theme = readCachedTerminalTheme();
	return {
		theme,
		background: theme.background ?? "#151110",
		fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
		fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	};
}

function readCachedTerminalTheme(): ITheme {
	try {
		const cachedTerminal = localStorage.getItem("theme-terminal");
		if (cachedTerminal) {
			return toXtermTheme(JSON.parse(cachedTerminal));
		}
		const themeId = localStorage.getItem("theme-id") ?? DEFAULT_THEME_ID;
		const theme = builtInThemes.find((t) => t.id === themeId);
		if (theme) {
			return toXtermTheme(getTerminalColors(theme));
		}
	} catch {}
	const defaultTheme = builtInThemes.find((t) => t.id === DEFAULT_THEME_ID);
	return defaultTheme
		? toXtermTheme(getTerminalColors(defaultTheme))
		: { background: "#151110", foreground: "#eae8e6" };
}
