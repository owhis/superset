/**
 * Lightweight scroll position registry for persisting scroll state across
 * tab/workspace switches. Follows the same pattern as editorBufferRegistry —
 * a plain Map outside React state, keyed by documentKey.
 */

interface ScrollPosition {
	/** Pixel offset from the top of the scrollable container. */
	scrollTop: number;
	/** Pixel offset from the left of the scrollable container. */
	scrollLeft: number;
}

const scrollPositions = new Map<string, ScrollPosition>();

export function getScrollPosition(
	documentKey: string,
): ScrollPosition | undefined {
	return scrollPositions.get(documentKey);
}

export function saveScrollPosition(
	documentKey: string,
	scrollTop: number,
	scrollLeft: number,
): void {
	scrollPositions.set(documentKey, { scrollTop, scrollLeft });
}

export function deleteScrollPosition(documentKey: string): void {
	scrollPositions.delete(documentKey);
}

export function hasScrollPosition(documentKey: string): boolean {
	return scrollPositions.has(documentKey);
}

export function transferScrollPosition(
	previousDocumentKey: string,
	nextDocumentKey: string,
): void {
	if (previousDocumentKey === nextDocumentKey) {
		return;
	}

	const previous = scrollPositions.get(previousDocumentKey);
	if (!previous) {
		return;
	}

	scrollPositions.set(nextDocumentKey, { ...previous });
	scrollPositions.delete(previousDocumentKey);
}
