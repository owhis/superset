import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands";
import {
	bracketMatching,
	codeFolding,
	foldGutter,
	foldKeymap,
	indentOnInput,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
	drawSelection,
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	type LayerMarker,
	layer,
	lineNumbers,
	RectangleMarker,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { colorPicker } from "@replit/codemirror-css-color-picker";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { type MutableRefObject, useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useResolvedTheme } from "renderer/stores/theme";
import {
	type CodeEditorAdapter,
	createCodeMirrorAdapter,
} from "./CodeEditorAdapter";
import { createCodeMirrorTheme } from "./createCodeMirrorTheme";
import { loadLanguageSupport } from "./loadLanguageSupport";
import { getCodeSyntaxHighlighting } from "./syntax-highlighting";

interface CodeEditorProps {
	value: string;
	language: string;
	readOnly?: boolean;
	fillHeight?: boolean;
	className?: string;
	editorRef?: MutableRefObject<CodeEditorAdapter | null>;
	onChange?: (value: string) => void;
	onSave?: () => void;
}

// Lucide chevron paths, inlined so we return a plain HTMLElement (foldGutter's
// markerDOM contract) without bridging React. Matches lucide-react's ChevronDown
// and ChevronRight exactly.
const CHEVRON_DOWN_PATH = "m6 9 6 6 6-6";
const CHEVRON_RIGHT_PATH = "m9 18 6-6-6-6";

function buildFoldChevron(open: boolean): HTMLElement {
	const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	el.setAttribute("viewBox", "0 0 24 24");
	el.setAttribute("fill", "none");
	el.setAttribute("stroke", "currentColor");
	el.setAttribute("stroke-width", "2");
	el.setAttribute("stroke-linecap", "round");
	el.setAttribute("stroke-linejoin", "round");
	el.setAttribute("class", "cm-foldChevron");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", open ? CHEVRON_DOWN_PATH : CHEVRON_RIGHT_PATH);
	el.appendChild(path);
	return el as unknown as HTMLElement;
}

// Toggle a class on the editor root when any selection range is non-empty, so
// CSS can suppress the active-line highlight while a selection is drawn.
const selectionClassTogglePlugin = ViewPlugin.fromClass(
	class {
		constructor(view: EditorView) {
			this.sync(view);
		}
		update(update: ViewUpdate) {
			if (update.selectionSet || update.docChanged) {
				this.sync(update.view);
			}
		}
		sync(view: EditorView) {
			const hasSelection = view.state.selection.ranges.some((r) => !r.empty);
			view.dom.classList.toggle("cm-hasSelection", hasSelection);
		}
	},
);

// Custom selection layer: draws selection backgrounds per-line, snug to each
// line's actual text instead of CM's default full-line-width fill for middle
// lines of multi-line selections.
//
// We keep drawSelection() for cursor rendering (including multi-cursor); its
// own .cm-selectionBackground rectangles are hidden via CSS so this layer is
// the only thing painting selection backgrounds.
const contourSelectionLayer = layer({
	above: false,
	class: "cm-contourSelectionLayer",
	update(update) {
		return (
			update.docChanged ||
			update.viewportChanged ||
			update.selectionSet ||
			update.geometryChanged
		);
	},
	markers(view) {
		const markers: LayerMarker[] = [];
		const lineHeight = view.defaultLineHeight;
		for (const range of view.state.selection.ranges) {
			if (range.empty) continue;
			const fromLine = view.state.doc.lineAt(range.from);
			const toLine = view.state.doc.lineAt(range.to);
			const TRAILING_PAD = 4;
			// Half-height-wide stub for empty lines in the middle of a selection
			// so the selection stays visually contiguous through blank lines.
			const EMPTY_LINE_WIDTH = Math.round(lineHeight / 2);
			for (let n = fromLine.number; n <= toLine.number; n += 1) {
				const line = view.state.doc.line(n);
				const selStart = Math.max(range.from, line.from);
				// Clamp selection end to actual text end so trailing whitespace
				// space past the last visible character is never filled.
				const textEnd = line.from + line.text.length;
				const selEnd = Math.min(range.to, textEnd);
				const isEmpty = selStart >= selEnd;
				const isMiddleLine = n > fromLine.number && n < toLine.number;
				// Skip edge lines that fall in empty territory (selection starts at
				// end-of-line or ends at start-of-line); only show the stub for
				// genuinely empty middle lines.
				if (isEmpty && !isMiddleLine) continue;
				const lineRange = isEmpty
					? EditorSelection.cursor(line.from)
					: EditorSelection.range(selStart, selEnd);
				for (const m of RectangleMarker.forRange(
					view,
					"cm-contourSelection",
					lineRange,
				)) {
					// Expand each rect to fill the full line-cell height. Use exactly
					// lineHeight (no +1) so consecutive rects abut without overlap —
					// overlap darkens at transparent fill alphas into a visible stripe.
					const gap = Math.max(0, lineHeight - m.height);
					const width = isEmpty
						? EMPTY_LINE_WIDTH
						: (m.width ?? 0) + TRAILING_PAD;
					markers.push(
						new RectangleMarker(
							"cm-contourSelection",
							m.left,
							m.top - gap / 2,
							width,
							lineHeight,
						),
					);
				}
			}
		}
		return markers;
	},
});

// Lucide MoreHorizontal (three dots) — inline SVG built imperatively so we can
// return a plain HTMLElement to CM's placeholderDOM contract.
function buildFoldPlaceholder(
	_view: unknown,
	onclick: (event: Event) => void,
): HTMLElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "cm-foldPlaceholder";
	button.setAttribute("aria-label", "Unfold");
	button.addEventListener("click", onclick);

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("class", "cm-foldPlaceholderIcon");
	for (const cx of ["5", "12", "19"]) {
		const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		c.setAttribute("cx", cx);
		c.setAttribute("cy", "12");
		c.setAttribute("r", "1");
		svg.appendChild(c);
	}
	button.appendChild(svg);
	return button;
}

export function CodeEditor({
	value,
	language,
	readOnly = false,
	fillHeight = true,
	className,
	editorRef,
	onChange,
	onSave,
}: CodeEditorProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageCompartment = useRef(new Compartment()).current;
	const themeCompartment = useRef(new Compartment()).current;
	const editableCompartment = useRef(new Compartment()).current;
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	// Guards against re-entrant onChange calls triggered by the value-sync effect's own dispatch.
	const isExternalUpdateRef = useRef(false);
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});
	const editorFontFamily = fontSettings?.editorFontFamily ?? undefined;
	const editorFontSize = fontSettings?.editorFontSize ?? undefined;
	const activeTheme = useResolvedTheme();

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;

	// biome-ignore lint/correctness/useExhaustiveDependencies: Editor instance is created once and reconfigured via dedicated effects below
	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			if (isExternalUpdateRef.current) return;
			onChangeRef.current?.(update.state.doc.toString());
		});

		const saveKeymap = keymap.of([
			{
				key: "Mod-s",
				run: () => {
					onSaveRef.current?.();
					return true;
				},
			},
		]);

		const state = EditorState.create({
			doc: value,
			extensions: [
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightSpecialChars(),
				history(),
				// Render fold markers as Lucide SVGs rather than Unicode glyphs —
				// text glyphs have font-dependent baselines that refuse to align
				// with line numbers. SVGs have exact bounding boxes and scale
				// predictably. Hover reveal is handled in createCodeMirrorTheme.
				foldGutter({ markerDOM: buildFoldChevron }),
				// Collapsed-block placeholder uses Lucide MoreHorizontal. Lives
				// in a separate codeFolding() — its config facet combines with
				// the one registered internally by foldGutter().
				codeFolding({ placeholderDOM: buildFoldPlaceholder }),
				drawSelection(),
				dropCursor(),
				EditorState.allowMultipleSelections.of(true),
				indentOnInput(),
				bracketMatching(),
				highlightActiveLine(),
				highlightSelectionMatches(),
				colorPicker,
				contourSelectionLayer,
				selectionClassTogglePlugin,
				editableCompartment.of([
					EditorState.readOnly.of(readOnly),
					EditorView.editable.of(!readOnly),
				]),
				EditorView.contentAttributes.of({
					spellcheck: "false",
				}),
				keymap.of([
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
					...searchKeymap,
					...foldKeymap,
				]),
				saveKeymap,
				themeCompartment.of([
					getCodeSyntaxHighlighting(activeTheme),
					createCodeMirrorTheme(
						activeTheme,
						{ fontFamily: editorFontFamily, fontSize: editorFontSize },
						fillHeight,
					),
				]),
				languageCompartment.of([]),
				updateListener,
			],
		});

		const view = new EditorView({
			state,
			parent: containerRef.current,
		});
		const adapter = createCodeMirrorAdapter(view);

		viewRef.current = view;
		if (editorRef) {
			editorRef.current = adapter;
		}

		return () => {
			if (editorRef?.current === adapter) {
				editorRef.current = null;
			}
			adapter.dispose();
			viewRef.current = null;
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const currentValue = view.state.doc.toString();
		if (currentValue === value) return;

		// Guarantee flag reset regardless of whether dispatch throws (e.g. view destroyed between null-check and dispatch).
		isExternalUpdateRef.current = true;
		try {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: value,
				},
			});
		} finally {
			isExternalUpdateRef.current = false;
		}
	}, [value]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: themeCompartment.reconfigure([
				getCodeSyntaxHighlighting(activeTheme),
				createCodeMirrorTheme(
					activeTheme,
					{ fontFamily: editorFontFamily, fontSize: editorFontSize },
					fillHeight,
				),
			]),
		});
	}, [
		activeTheme,
		editorFontFamily,
		editorFontSize,
		fillHeight,
		themeCompartment,
	]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: editableCompartment.reconfigure([
				EditorState.readOnly.of(readOnly),
				EditorView.editable.of(!readOnly),
			]),
		});
	}, [editableCompartment, readOnly]);

	useEffect(() => {
		let cancelled = false;

		void loadLanguageSupport(language)
			.then((extension) => {
				if (cancelled) return;
				const view = viewRef.current;
				if (!view) return;

				view.dispatch({
					effects: languageCompartment.reconfigure(extension ?? []),
				});
			})
			.catch((error) => {
				if (cancelled) return;
				const view = viewRef.current;
				if (!view) return;

				console.error("[CodeEditor] Failed to load language support:", {
					error,
					language,
				});
				view.dispatch({
					effects: languageCompartment.reconfigure([]),
				});
			});

		return () => {
			cancelled = true;
		};
	}, [language, languageCompartment]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"min-w-0",
				fillHeight ? "h-full w-full" : "w-full",
				className,
			)}
		/>
	);
}
