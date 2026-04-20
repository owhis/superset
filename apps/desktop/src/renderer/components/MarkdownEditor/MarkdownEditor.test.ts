/**
 * Regression tests for https://github.com/superset-sh/superset/issues/3588
 *
 * Task-list (checklist) items must serialize to the GitHub-flavored markdown
 * form `- [ ]` / `- [x]`.
 *
 * The upstream `tiptap-markdown@0.9.0` task-item serializer writes only
 * `[ ] ` / `[x] ` and relies on the parent task-list's `renderList` call
 * to supply the `- ` prefix via `firstDelim`. When the task-list serializer
 * is *not* invoked (for example, when the node tree is serialized with a
 * schema that has not registered the task-list serializer, or a nested
 * task-item becomes the top of a sub-render), the `- ` is dropped and the
 * resulting markdown contains bare `[ ] ` lines — which neither GitHub
 * nor markdown-it-task-lists will parse back into a checklist.
 *
 * We own the fix by overriding the task-item storage in `MarkdownEditor`:
 * it always writes `- [ ] ` / `- [x] ` so the output is robust to the
 * parent list serializer being absent or replaced.
 */

import { describe, expect, test } from "bun:test";
import { MarkdownSerializerState } from "@tiptap/pm/markdown";
import { Schema } from "@tiptap/pm/model";

type SerializeFn = (
	state: MarkdownSerializerState,
	node: ReturnType<Schema["node"]>,
) => void;

type NodeSerializers = Record<string, SerializeFn>;

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: {
			content: "inline*",
			group: "block",
			toDOM: () => ["p", 0],
		},
		text: { group: "inline" },
		taskList: {
			content: "taskItem+",
			group: "block",
		},
		taskItem: {
			content: "paragraph+",
			attrs: { checked: { default: false } },
		},
	},
});

/** The buggy upstream task-item serializer from tiptap-markdown@0.9.0. */
const buggyTaskItemSerialize: SerializeFn = (state, node) => {
	const check = node.attrs.checked ? "[x]" : "[ ]";
	state.write(`${check} `);
	state.renderContent(node);
};

/** The fixed task-item serializer used by MarkdownEditor.tsx. */
const fixedTaskItemSerialize: SerializeFn = (state, node) => {
	const check = node.attrs.checked ? "[x]" : "[ ]";
	state.write(`- ${check} `);
	state.renderContent(node);
};

const paragraphSerialize: SerializeFn = (state, node) => {
	state.renderInline(node);
	state.closeBlock(node);
};

const textSerialize: SerializeFn = (state, node) => {
	state.text(node.text ?? "", false);
};

function buildSerializers(
	taskItem: SerializeFn,
	taskList: SerializeFn,
): NodeSerializers {
	return {
		doc: (state, node) => {
			state.renderContent(node);
		},
		paragraph: paragraphSerialize,
		text: textSerialize,
		taskList,
		taskItem,
	};
}

// The `MarkdownSerializerState` constructor and `out` property are marked
// `@internal` in the public types, but they are part of the documented public
// runtime API and are how every prosemirror-markdown serializer drives output.
// biome-ignore lint/suspicious/noExplicitAny: intentional use of internal runtime API for focused serializer testing
const MarkdownSerializerStateCtor = MarkdownSerializerState as any;

function serialize(
	doc: ReturnType<Schema["node"]>,
	taskItem: SerializeFn,
	taskList: SerializeFn,
): string {
	const state = new MarkdownSerializerStateCtor(
		buildSerializers(taskItem, taskList),
		{},
		{},
	);
	state.renderContent(doc);
	return state.out as string;
}

function buildDoc(items: { checked: boolean; text: string }[]) {
	return schema.node("doc", null, [
		schema.node(
			"taskList",
			null,
			items.map(({ checked, text }) =>
				schema.node("taskItem", { checked }, [
					schema.node("paragraph", null, [schema.text(text)]),
				]),
			),
		),
	]);
}

describe("MarkdownEditor task-list serializer (#3588)", () => {
	// This demonstrates the buggy behavior: when the task-item serializer is
	// invoked without a list-marker-emitting parent serializer, the `- ` is
	// lost. The upstream `tiptap-markdown` task-item serializer depends on
	// an outer bullet-list-style `renderList` call to prepend the marker.
	test("upstream task-item serializer without a list-marker parent drops the `- `", () => {
		const doc = buildDoc([{ checked: false, text: "buy milk" }]);
		// A "pass-through" task-list serializer that does not add a marker —
		// this is what you get if the task-list entry is missing from the
		// serializer map, or if an override strips the marker.
		const passThroughTaskList: SerializeFn = (state, node) => {
			state.renderContent(node);
		};
		const out = serialize(doc, buggyTaskItemSerialize, passThroughTaskList);
		expect(out).toBe("[ ] buy milk");
		expect(out.startsWith("- ")).toBe(false);
	});

	test("fixed task-item serializer emits `- [ ]` even without a list-marker parent", () => {
		const doc = buildDoc([{ checked: false, text: "buy milk" }]);
		const passThroughTaskList: SerializeFn = (state, node) => {
			state.renderContent(node);
		};
		expect(serialize(doc, fixedTaskItemSerialize, passThroughTaskList)).toBe(
			"- [ ] buy milk",
		);
	});

	test("fixed task-item serializer emits `- [x]` for checked items", () => {
		const doc = buildDoc([{ checked: true, text: "ship it" }]);
		const passThroughTaskList: SerializeFn = (state, node) => {
			state.renderContent(node);
		};
		expect(serialize(doc, fixedTaskItemSerialize, passThroughTaskList)).toBe(
			"- [x] ship it",
		);
	});

	test("fixed task-item serializer produces valid GFM output for multiple items", () => {
		const doc = buildDoc([
			{ checked: false, text: "first" },
			{ checked: true, text: "second" },
			{ checked: false, text: "third" },
		]);
		const passThroughTaskList: SerializeFn = (state, node) => {
			state.renderContent(node);
		};
		expect(serialize(doc, fixedTaskItemSerialize, passThroughTaskList)).toBe(
			"- [ ] first\n\n- [x] second\n\n- [ ] third",
		);
	});
});

describe("MarkdownEditor override wiring (#3588)", () => {
	test("MarkdownEditor.tsx overrides TaskItem's markdown storage so items always serialize with `- `", async () => {
		const source = await Bun.file(
			new URL("./MarkdownEditor.tsx", import.meta.url),
		).text();

		// The override must exist so the bug cannot silently regress if the
		// upstream task-item serializer stays buggy.
		expect(source).toContain("addStorage");
		expect(source).toMatch(/state\.write\(\s*`- \$\{check\} `\s*\)/);
	});
});
