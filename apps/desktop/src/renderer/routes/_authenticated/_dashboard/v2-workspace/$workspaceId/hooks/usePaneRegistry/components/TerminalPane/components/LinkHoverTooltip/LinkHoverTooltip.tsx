import type { ExternalApp } from "@superset/local-db";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAppOption } from "renderer/components/OpenInExternalDropdown/constants";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";
import { electronTrpcClient } from "renderer/lib/trpc-client";

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

export function LinkHoverTooltip({ hoveredLink }: LinkHoverTooltipProps) {
	const [defaultEditor, setDefaultEditor] = useState<ExternalApp | null>(null);

	useEffect(() => {
		let cancelled = false;
		electronTrpcClient.settings.getDefaultEditor
			.query()
			.then((editor) => {
				if (!cancelled) setDefaultEditor(editor);
			})
			.catch(() => {
				if (!cancelled) setDefaultEditor(null);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!hoveredLink || !hoveredLink.modifier) return null;

	const label = getLabel(hoveredLink.info, hoveredLink.shift, defaultEditor);

	return createPortal(
		<div
			className="pointer-events-none fixed z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
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
