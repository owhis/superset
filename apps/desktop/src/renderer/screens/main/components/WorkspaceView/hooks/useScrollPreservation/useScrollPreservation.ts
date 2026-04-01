import { type RefObject, useEffect, useRef } from "react";

/**
 * Module-level cache for scroll positions.
 * Survives React unmount/remount cycles (workspace switches).
 */
const scrollCache = new Map<string, number>();
const MAX_SCROLL_RESTORE_WAIT_MS = 5_000;

function restoreScrollTop(
	container: HTMLElement,
	scrollTop: number,
	onRestore: (restoredTop: number) => void,
): () => void {
	let resizeObserver: ResizeObserver | null = null;
	let timeoutId: number | null = null;
	let cancelled = false;

	const cleanup = () => {
		cancelled = true;
		resizeObserver?.disconnect();
		resizeObserver = null;
		if (timeoutId != null) {
			window.clearTimeout(timeoutId);
		}
	};

	const applyScroll = () => {
		const maxScrollTop = Math.max(
			0,
			container.scrollHeight - container.clientHeight,
		);
		const target = Math.min(scrollTop, maxScrollTop);
		container.scrollTop = target;
		onRestore(container.scrollTop);
		if (scrollTop === 0) {
			return true;
		}

		return maxScrollTop >= scrollTop && container.scrollTop >= target;
	};

	requestAnimationFrame(() => {
		if (cancelled) return;
		if (applyScroll()) return;

		if (typeof ResizeObserver === "undefined") {
			requestAnimationFrame(() => {
				if (cancelled) return;
				applyScroll();
			});
			return;
		}

		resizeObserver = new ResizeObserver(() => {
			if (cancelled) return;
			if (applyScroll()) {
				cleanup();
			}
		});
		resizeObserver.observe(container);
		timeoutId = window.setTimeout(cleanup, MAX_SCROLL_RESTORE_WAIT_MS);
	});

	return cleanup;
}

export function getCachedScrollTop(cacheKey: string) {
	return scrollCache.get(cacheKey);
}

export function setCachedScrollTop(cacheKey: string, scrollTop: number) {
	if (scrollTop > 0) {
		scrollCache.set(cacheKey, scrollTop);
	} else {
		scrollCache.delete(cacheKey);
	}
}

export function clearScrollCache(cacheKey: string) {
	scrollCache.delete(cacheKey);
}

/**
 * Preserves the scroll position of a DOM container across unmount/remount cycles.
 *
 * Attaches a scroll listener to track the current `scrollTop`, saves it to a
 * module-level cache on cleanup, and restores it on mount.
 *
 * Use this for plain scrollable containers (diff viewer, rendered markdown,
 * changes list, chat messages, etc.). Does NOT cover virtual-scroll systems
 * like CodeMirror or xterm.js — those need their own save/restore mechanisms.
 *
 * @param containerRef - Ref to the scrollable DOM element
 * @param cacheKey     - Stable key identifying the scroll context (e.g. paneId, worktreePath)
 * @param deps         - Extra dependencies that, when changed, signal the container ref
 *                       may have been (re-)populated (e.g. loading flags, data objects)
 */
export function useScrollPreservation(
	containerRef: RefObject<HTMLElement | null>,
	cacheKey: string,
	deps: readonly unknown[] = [],
) {
	const lastScrollTopRef = useRef(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object — we read .current inside the effect, not as a dep
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Restore saved scroll position after the browser paints
		const saved = getCachedScrollTop(cacheKey);
		lastScrollTopRef.current = saved ?? container.scrollTop;
		const cancelRestore =
			saved != null
				? restoreScrollTop(container, saved, (restoredTop) => {
						lastScrollTopRef.current = restoredTop;
					})
				: undefined;
		if (saved != null) {
			lastScrollTopRef.current = saved;
		}

		const onScroll = () => {
			lastScrollTopRef.current = container.scrollTop;
		};
		container.addEventListener("scroll", onScroll);

		return () => {
			cancelRestore?.();
			container.removeEventListener("scroll", onScroll);
			const scrollTop = container.scrollTop;
			lastScrollTopRef.current = scrollTop;
			setCachedScrollTop(cacheKey, scrollTop);
		};
	}, [cacheKey, ...deps]);
}
