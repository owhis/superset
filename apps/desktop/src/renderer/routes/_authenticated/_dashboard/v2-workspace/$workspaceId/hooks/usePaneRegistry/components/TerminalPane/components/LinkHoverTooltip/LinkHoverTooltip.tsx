import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";

interface HoveredLink {
	clientX: number;
	clientY: number;
	info: LinkHoverInfo;
	modifier: boolean;
	shift: boolean;
}

interface LinkHoverTooltipProps {
	hoveredLink: HoveredLink | null;
}

function getLabel(info: LinkHoverInfo, shift: boolean): string {
	if (info.kind === "url") {
		return shift ? "Open in external browser" : "Open in browser";
	}
	if (info.isDirectory) {
		return shift ? "Open externally" : "Reveal in sidebar";
	}
	return shift ? "Open externally" : "Open in editor";
}

export function LinkHoverTooltip({ hoveredLink }: LinkHoverTooltipProps) {
	if (!hoveredLink || !hoveredLink.modifier) return null;

	const label = getLabel(hoveredLink.info, hoveredLink.shift);

	return createPortal(
		<div
			className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
			style={{
				left: hoveredLink.clientX + 14,
				top: hoveredLink.clientY + 14,
			}}
		>
			{label}
		</div>,
		document.body,
	);
}

export function useLinkHoverState() {
	const [hoveredLink, setHoveredLink] = useState<HoveredLink | null>(null);

	useEffect(() => {
		if (!hoveredLink) return;
		const update = (event: KeyboardEvent) => {
			setHoveredLink((prev) => {
				if (!prev) return null;
				return {
					...prev,
					modifier: event.metaKey || event.ctrlKey,
					shift: event.shiftKey,
				};
			});
		};
		window.addEventListener("keydown", update);
		window.addEventListener("keyup", update);
		return () => {
			window.removeEventListener("keydown", update);
			window.removeEventListener("keyup", update);
		};
	}, [hoveredLink]);

	const onHover = useCallback((event: MouseEvent, info: LinkHoverInfo) => {
		setHoveredLink({
			clientX: event.clientX,
			clientY: event.clientY,
			info,
			modifier: event.metaKey || event.ctrlKey,
			shift: event.shiftKey,
		});
	}, []);

	const onLeave = useCallback(() => {
		setHoveredLink(null);
	}, []);

	return { hoveredLink, onHover, onLeave };
}
