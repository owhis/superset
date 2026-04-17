import { useCallback, useState } from "react";

export function useCopyToClipboard(timeout = 2000) {
	const [copied, setCopied] = useState(false);

	const copyToClipboard = useCallback(
		async (text: string) => {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), timeout);
		},
		[timeout],
	);

	return { copyToClipboard, copied };
}
