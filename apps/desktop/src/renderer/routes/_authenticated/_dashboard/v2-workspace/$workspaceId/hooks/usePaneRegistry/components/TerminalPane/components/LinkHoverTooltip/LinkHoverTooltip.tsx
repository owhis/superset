import type { ExternalApp } from "@superset/local-db";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAppOption } from "renderer/components/OpenInExternalDropdown/constants";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { LinkClickHint } from "../../hooks/useLinkClickHint";
import type { HoveredLink } from "../../hooks/useLinkHoverState";

const TOOLTIP_OFFSET_PX = 14;
const TOOLTIP_CLASSES =
	"pointer-events-none fixed z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background";

const isMac =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");
const MOD_LABEL = isMac ? "⌘" : "Ctrl";
const MOD_SHIFT_LABEL = isMac ? "⌘⇧" : "Ctrl+Shift";
const HINT_LABEL = `Hold ${MOD_LABEL} to open · ${MOD_SHIFT_LABEL} for external`;

interface LinkHoverTooltipProps {
	hoveredLink: HoveredLink | null;
	hint: LinkClickHint | null;
}

function getAppLabel(app: ExternalApp): string {
	const option = getAppOption(app);
	return option?.displayLabel ?? option?.label ?? "external editor";
}

function getLabel(
	info: LinkHoverInfo,
	shift: boolean,
	defaultEditor: ExternalApp | null,
): string {
	if (info.kind === "url") {
		return shift ? "Open in external browser" : "Open in browser";
	}
	if (shift) {
		return defaultEditor
			? `Open in ${getAppLabel(defaultEditor)}`
			: "Open externally";
	}
	return info.isDirectory ? "Reveal in sidebar" : "Open in editor";
}

export function LinkHoverTooltip({ hoveredLink, hint }: LinkHoverTooltipProps) {
	const [defaultEditor, setDefaultEditor] = useState<ExternalApp | null>(null);
	const hovering = hoveredLink !== null;

	useEffect(() => {
		if (!hovering) return;
		let cancelled = false;
		electronTrpcClient.settings.getDefaultEditor
			.query()
			.then((editor) => {
				if (!cancelled) setDefaultEditor(editor);
			})
			.catch((error) => {
				if (cancelled) return;
				console.warn(
					"[LinkHoverTooltip] Failed to fetch default editor:",
					error,
				);
				setDefaultEditor(null);
			});
		return () => {
			cancelled = true;
		};
	}, [hovering]);

	const showingHover = Boolean(hoveredLink?.modifier);

	return createPortal(
		<>
			{hoveredLink?.modifier && (
				<div
					className={TOOLTIP_CLASSES}
					style={{
						left: hoveredLink.clientX + TOOLTIP_OFFSET_PX,
						top: hoveredLink.clientY + TOOLTIP_OFFSET_PX,
					}}
				>
					{getLabel(hoveredLink.info, hoveredLink.shift, defaultEditor)}
				</div>
			)}
			<AnimatePresence>
				{hint && !showingHover && (
					<motion.div
						key="hint"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className={TOOLTIP_CLASSES}
						style={{
							left: hint.clientX + TOOLTIP_OFFSET_PX,
							top: hint.clientY + TOOLTIP_OFFSET_PX,
						}}
					>
						{HINT_LABEL}
					</motion.div>
				)}
			</AnimatePresence>
		</>,
		document.body,
	);
}
