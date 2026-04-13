/**
 * Reproduction tests for issue #3431:
 * "Scroll and Width issues with Codex and Claude Code"
 *
 * Two bugs reported:
 *
 * 1. SCROLL: Terminal doesn't scroll to the bottom after content loads —
 *    it stays in the middle of the screen.
 *
 *    Root cause: `scheduleScrollToBottom` uses a single `requestAnimationFrame`.
 *    After writing large content, xterm may need more than one frame to finish
 *    rendering. A single RAF can fire before rendering completes, so
 *    `scrollToBottom()` scrolls to a stale `baseY` (mid-content).
 *
 * 2. WIDTH: When opening a new CLI tool (e.g. Claude Code), the terminal
 *    renders at half the expected width. Fixed after tab switching.
 *
 *    Root cause: `attachToContainer` calls `fitAddon.fit()` synchronously
 *    right after `container.appendChild(wrapper)`. When xterm was opened into
 *    a *detached* wrapper div (the "hide attach" cache pattern), its internal
 *    cell-dimension metrics are stale/zero. The synchronous `fit()` reads the
 *    correct container width but divides by stale cell widths, producing too
 *    few columns. The ResizeObserver fires later but may compute the same
 *    wrong column count (cell metrics still stale on the first observer
 *    callback). On tab switch, reattach triggers a fresh `fit()` by which
 *    time xterm's renderer has corrected its cell metrics, so the width is
 *    correct.
 *
 *    Fix: add a deferred `requestAnimationFrame` re-fit after the synchronous
 *    fit. By the next frame the renderer has had a
 *    paint cycle to update cell dimensions, so `fit()` produces correct cols.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of attachToContainer's fit behaviour.
// Mirrors the production code in v1-terminal-cache.ts.
// ---------------------------------------------------------------------------

type FitResult = { cols: number; rows: number };

/**
 * Simulates the fitAddon.fit() call.
 * In production, fit() measures the container's pixel dimensions and divides
 * by cell dimensions to compute cols/rows.
 *
 * When xterm is opened into a *detached* wrapper, cell dimensions are stale
 * (e.g. 0 or default values), causing fit() to return wrong column counts
 * until the renderer has had a paint cycle to measure actual glyphs.
 */
function createMockFitAddon(opts: {
	containerWidth: number;
	cellWidth: number;
	/** Simulates stale cell width from detached open (corrected after first paint). */
	staleCellWidth?: number;
}) {
	let paintCycleCompleted = false;
	let fitCallCount = 0;

	return {
		fit(): FitResult {
			fitCallCount++;
			const effectiveCellWidth = paintCycleCompleted
				? opts.cellWidth
				: (opts.staleCellWidth ?? opts.cellWidth);
			const cols = Math.floor(opts.containerWidth / effectiveCellWidth);
			const rows = 24; // fixed for simplicity
			return { cols, rows };
		},
		/** Simulate the browser completing a paint cycle (renderer updates cell metrics). */
		completePaintCycle() {
			paintCycleCompleted = true;
		},
		get fitCallCount() {
			return fitCallCount;
		},
	};
}

// ---------------------------------------------------------------------------
// Minimal model of attachToContainer (BEFORE fix)
// ---------------------------------------------------------------------------

function attachToContainerBefore(
	fitAddon: ReturnType<typeof createMockFitAddon>,
	_onResize?: (result: FitResult) => void,
): { lastCols: number; lastRows: number } {
	// Synchronous fit right after appendChild (production code before fix)
	const result = fitAddon.fit();
	return { lastCols: result.cols, lastRows: result.rows };
}

// ---------------------------------------------------------------------------
// Minimal model of attachToContainer (AFTER fix)
// ---------------------------------------------------------------------------

function attachToContainerAfter(
	fitAddon: ReturnType<typeof createMockFitAddon>,
	onResize?: (result: FitResult) => void,
): {
	lastCols: number;
	lastRows: number;
	/** Flush the deferred RAF re-fit. Returns updated state. */
	flushDeferredFit: () => { lastCols: number; lastRows: number };
} {
	// Synchronous fit (same as before — still useful for reattach cases)
	const result = fitAddon.fit();
	const state = { lastCols: result.cols, lastRows: result.rows };

	// Deferred re-fit scheduled via requestAnimationFrame (the fix)
	const flushDeferredFit = () => {
		const prev = { cols: state.lastCols, rows: state.lastRows };
		const newResult = fitAddon.fit();
		state.lastCols = newResult.cols;
		state.lastRows = newResult.rows;
		if (state.lastCols !== prev.cols || state.lastRows !== prev.rows) {
			onResize?.(newResult);
		}
		return { lastCols: state.lastCols, lastRows: state.lastRows };
	};

	return { ...state, flushDeferredFit };
}

// ---------------------------------------------------------------------------
// Minimal model of scheduleScrollToBottom
// ---------------------------------------------------------------------------

/**
 * Models the scroll-to-bottom scheduling behaviour.
 *
 * In production, xterm.write(data, callback) fires the callback once the
 * parser has processed the input. But the *renderer* updates baseY (the
 * total scrollable area) asynchronously during subsequent animation frames.
 *
 * `scheduleScrollToBottom` queues a single `requestAnimationFrame` that calls
 * `terminal.scrollToBottom()`. If the renderer hasn't finished updating
 * baseY by that frame, `scrollToBottom()` targets a stale baseY, leaving
 * the viewport stranded mid-content.
 *
 * The model simulates this: the write callback fires immediately (parser
 * done), the renderer updates baseY over subsequent frames, and the scroll
 * RAF competes with the renderer for frame time.
 */
function createScrollModel() {
	let baseY = 0; // total scrollable lines (grows as renderer processes)
	let viewportY = 0; // current scroll position
	/** Queue of callbacks to run on each "frame". */
	const frameQueue: Array<() => void> = [];

	return {
		/**
		 * Simulate writing content whose parser callback fires immediately,
		 * but the renderer takes `framesNeeded` animation frames to fully
		 * update baseY.
		 *
		 * In production, the write callback (where scheduleScrollToBottom is
		 * called) fires BEFORE the renderer starts updating. So the scroll
		 * RAF and the renderer's update frames interleave.
		 */
		simulateWriteAndScheduleScroll(
			totalLines: number,
			framesNeeded: number,
			mode: "single-raf" | "double-raf",
		) {
			// Parser callback fires immediately (synchronous in the model).
			// At this point, baseY is NOT yet updated — renderer hasn't run.

			// Schedule the scroll (this is what production code does in the
			// write callback via scheduleScrollToBottom).
			if (mode === "single-raf") {
				// Single RAF: scroll runs on the very next frame
				frameQueue.push(() => {
					viewportY = baseY;
				});
			} else {
				// Double RAF: outer RAF fires first, then inner RAF queues
				frameQueue.push(() => {
					// First RAF fires — renderer may still be updating
					frameQueue.push(() => {
						// Second RAF fires — renderer should be done
						viewportY = baseY;
					});
				});
			}

			// Renderer updates baseY over the next N frames.
			// These are queued AFTER the scroll RAF(s) because in real
			// browsers, the write callback fires before the renderer's next
			// frame — so the scroll RAF was already queued first.
			const linesPerFrame = Math.ceil(totalLines / framesNeeded);
			let rendered = 0;
			for (let i = 0; i < framesNeeded; i++) {
				rendered = Math.min(rendered + linesPerFrame, totalLines);
				const capturedRendered = rendered;
				frameQueue.push(() => {
					baseY = capturedRendered;
				});
			}
		},
		/** Flush one pending frame callback. */
		flushOneFrame() {
			const cb = frameQueue.shift();
			cb?.();
		},
		/** Flush all pending frame callbacks. */
		flushAllFrames() {
			while (frameQueue.length > 0) {
				const cb = frameQueue.shift();
				cb?.();
			}
		},
		get baseY() {
			return baseY;
		},
		get viewportY() {
			return viewportY;
		},
		get isAtBottom() {
			return viewportY >= baseY;
		},
		get pendingFrames() {
			return frameQueue.length;
		},
	};
}

// ---------------------------------------------------------------------------
// Tests — Width (fitAddon.fit() timing in attachToContainer)
// ---------------------------------------------------------------------------

describe("attachToContainer fit timing — issue #3431 (width)", () => {
	const CONTAINER_WIDTH = 800; // pixels
	const CORRECT_CELL_WIDTH = 8; // pixels per character cell
	const STALE_CELL_WIDTH = 16; // stale value from detached open (2x actual)
	const EXPECTED_COLS = Math.floor(CONTAINER_WIDTH / CORRECT_CELL_WIDTH); // 100
	const WRONG_COLS = Math.floor(CONTAINER_WIDTH / STALE_CELL_WIDTH); // 50

	it("synchronous fit with stale cell metrics produces wrong column count", () => {
		const fitAddon = createMockFitAddon({
			containerWidth: CONTAINER_WIDTH,
			cellWidth: CORRECT_CELL_WIDTH,
			staleCellWidth: STALE_CELL_WIDTH,
		});

		// Before fix: only synchronous fit, no deferred re-fit
		const { lastCols } = attachToContainerBefore(fitAddon);

		// BUG: columns are half what they should be (stale cell width = 2x actual)
		expect(lastCols).toBe(WRONG_COLS);
		expect(lastCols).not.toBe(EXPECTED_COLS);
	});

	it("deferred re-fit after paint cycle corrects column count", () => {
		const fitAddon = createMockFitAddon({
			containerWidth: CONTAINER_WIDTH,
			cellWidth: CORRECT_CELL_WIDTH,
			staleCellWidth: STALE_CELL_WIDTH,
		});

		let resizeCalled = false;
		const { lastCols, flushDeferredFit } = attachToContainerAfter(
			fitAddon,
			() => {
				resizeCalled = true;
			},
		);

		// Initial synchronous fit still gets wrong columns
		expect(lastCols).toBe(WRONG_COLS);

		// Simulate browser paint cycle completing (renderer updates cell metrics)
		fitAddon.completePaintCycle();

		// Flush the deferred RAF re-fit
		const updated = flushDeferredFit();

		// FIX: deferred fit now produces correct columns
		expect(updated.lastCols).toBe(EXPECTED_COLS);
		// onResize callback was fired since dimensions changed
		expect(resizeCalled).toBe(true);
	});

	it("deferred re-fit is a no-op when synchronous fit was already correct", () => {
		// No stale cell width — simulates reattach where xterm is already rendered
		const fitAddon = createMockFitAddon({
			containerWidth: CONTAINER_WIDTH,
			cellWidth: CORRECT_CELL_WIDTH,
		});

		let resizeCalled = false;
		const { lastCols, flushDeferredFit } = attachToContainerAfter(
			fitAddon,
			() => {
				resizeCalled = true;
			},
		);

		// Synchronous fit is correct on reattach
		expect(lastCols).toBe(EXPECTED_COLS);

		fitAddon.completePaintCycle();
		const updated = flushDeferredFit();

		// No change — deferred fit is a no-op
		expect(updated.lastCols).toBe(EXPECTED_COLS);
		expect(resizeCalled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tests — Scroll (scheduleScrollToBottom timing)
// ---------------------------------------------------------------------------

describe("scheduleScrollToBottom timing — issue #3431 (scroll)", () => {
	it("single RAF scroll fires before renderer updates baseY (bug)", () => {
		const model = createScrollModel();

		// Write 200 lines that takes 2 frames to render.
		// The write callback fires immediately (parser done), then:
		//   - scroll RAF is queued first (from scheduleScrollToBottom)
		//   - renderer update frames are queued after
		model.simulateWriteAndScheduleScroll(200, 2, "single-raf");

		// Frame 1: scroll RAF fires — but baseY is still 0 (renderer hasn't run)
		model.flushOneFrame();

		// BUG: viewport scrolled to baseY=0, not the final 200 lines
		expect(model.viewportY).toBe(0);

		// Flush remaining frames (renderer updates)
		model.flushAllFrames();

		// Content is now fully rendered (baseY=200) but viewport is stuck at 0
		expect(model.baseY).toBe(200);
		expect(model.isAtBottom).toBe(false);
	});

	it("double RAF scroll fires after renderer has had time to update (fix)", () => {
		const model = createScrollModel();

		// Same scenario: 200 lines, 2 frames to render
		model.simulateWriteAndScheduleScroll(200, 2, "double-raf");

		// Frame ordering after all callbacks:
		//   1. outer scroll RAF fires -> queues inner scroll RAF
		//   2. renderer frame 1 (baseY = 100)
		//   3. renderer frame 2 (baseY = 200)
		//   4. inner scroll RAF fires -> viewportY = baseY (200)
		model.flushAllFrames();

		// FIX: viewport is at the bottom after all content rendered
		expect(model.baseY).toBe(200);
		expect(model.viewportY).toBe(200);
		expect(model.isAtBottom).toBe(true);
	});

	it("double RAF scroll works for fast-rendering content (1 frame)", () => {
		const model = createScrollModel();

		// Small content that renders in 1 frame
		model.simulateWriteAndScheduleScroll(50, 1, "double-raf");

		model.flushAllFrames();

		expect(model.baseY).toBe(50);
		expect(model.viewportY).toBe(50);
		expect(model.isAtBottom).toBe(true);
	});
});
