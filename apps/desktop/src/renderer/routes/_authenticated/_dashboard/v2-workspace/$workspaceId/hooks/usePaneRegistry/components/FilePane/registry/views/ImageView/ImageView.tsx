import { useMemo } from "react";
import { getImageMimeType } from "shared/file-types";
import type { ViewProps } from "../../types";

export function ImageView({ document, filePath }: ViewProps) {
	const dataUrl = useMemo(() => {
		if (document.content.kind !== "bytes") return null;
		const mimeType = getImageMimeType(filePath) ?? "image/png";
		const base64 = btoa(
			Array.from(document.content.value)
				.map((b) => String.fromCharCode(b))
				.join(""),
		);
		return `data:${mimeType};base64,${base64}`;
	}, [document.content, filePath]);

	if (!dataUrl) {
		return null;
	}

	return (
		<div className="flex h-full items-center justify-center overflow-auto bg-background p-4">
			<img
				src={dataUrl}
				alt={filePath.split("/").pop() ?? ""}
				className="max-h-full max-w-full object-contain"
				draggable={false}
			/>
		</div>
	);
}
