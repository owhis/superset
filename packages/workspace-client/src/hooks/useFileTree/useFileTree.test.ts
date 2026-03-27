import { describe, expect, test } from "bun:test";
import type { FsEntry } from "@superset/workspace-fs/host";

/**
 * Reproduces the bug described in issue #2925:
 * When a file is created and then replaced with a folder of the same name,
 * the stale file entry persists in the state and blocks folder usage.
 *
 * The core issue is that `deleteSubtree` was only called for directory delete
 * events, leaving stale file entries in `entriesByPath`. When a folder is then
 * created at the same path, the old file entry can shadow the new folder entry
 * until the next forced reload.
 */

// ─── Reproduce the state management logic from useFileTree ───

type FsEntryKind = "file" | "directory" | "symlink" | "other";

interface FileTreeState {
	childPathsByDirectory: Map<string, string[]>;
	entriesByPath: Map<string, FsEntry>;
	expandedDirectories: Set<string>;
	invalidatedDirectories: Set<string>;
	loadedDirectories: Set<string>;
	loadingDirectories: Set<string>;
}

function createInitialState(): FileTreeState {
	return {
		childPathsByDirectory: new Map(),
		entriesByPath: new Map(),
		expandedDirectories: new Set(),
		invalidatedDirectories: new Set(),
		loadedDirectories: new Set(),
		loadingDirectories: new Set(),
	};
}

function isWithinPath(rootPath: string, absolutePath: string): boolean {
	return (
		absolutePath === rootPath ||
		absolutePath.startsWith(`${rootPath}/`) ||
		absolutePath.startsWith(`${rootPath}\\`)
	);
}

function deleteSubtree(
	state: FileTreeState,
	absolutePath: string,
): FileTreeState {
	const nextEntries = new Map(state.entriesByPath);
	const nextChildren = new Map(state.childPathsByDirectory);
	const nextExpanded = new Set(state.expandedDirectories);
	const nextLoaded = new Set(state.loadedDirectories);
	const nextInvalidated = new Set(state.invalidatedDirectories);
	const nextLoading = new Set(state.loadingDirectories);

	for (const path of nextEntries.keys()) {
		if (isWithinPath(absolutePath, path)) {
			nextEntries.delete(path);
		}
	}

	for (const path of nextChildren.keys()) {
		if (isWithinPath(absolutePath, path)) {
			nextChildren.delete(path);
		}
	}

	for (const path of Array.from(nextExpanded)) {
		if (isWithinPath(absolutePath, path)) {
			nextExpanded.delete(path);
		}
	}

	for (const path of Array.from(nextLoaded)) {
		if (isWithinPath(absolutePath, path)) {
			nextLoaded.delete(path);
		}
	}

	for (const path of Array.from(nextInvalidated)) {
		if (isWithinPath(absolutePath, path)) {
			nextInvalidated.delete(path);
		}
	}

	for (const path of Array.from(nextLoading)) {
		if (isWithinPath(absolutePath, path)) {
			nextLoading.delete(path);
		}
	}

	return {
		childPathsByDirectory: nextChildren,
		entriesByPath: nextEntries,
		expandedDirectories: nextExpanded,
		invalidatedDirectories: nextInvalidated,
		loadedDirectories: nextLoaded,
		loadingDirectories: nextLoading,
	};
}

function getParentPath(absolutePath: string): string {
	const trimmedPath = absolutePath.replace(/[\\/]+$/, "");
	const lastSeparatorIndex = Math.max(
		trimmedPath.lastIndexOf("/"),
		trimmedPath.lastIndexOf("\\"),
	);

	if (lastSeparatorIndex <= 0) {
		return trimmedPath;
	}

	return trimmedPath.slice(0, lastSeparatorIndex);
}

// Simulates the event handler logic from useFileTree
function handleFileSystemEvent(
	state: FileTreeState,
	event: {
		kind: "create" | "delete" | "update" | "rename" | "overflow";
		absolutePath: string;
		isDirectory: boolean;
	},
): FileTreeState {
	const parentPath =
		event.kind === "update" && event.isDirectory
			? event.absolutePath
			: getParentPath(event.absolutePath);

	let nextState = state;

	// BUG FIX: Previously only called deleteSubtree for directory deletes.
	// Now we call it for all deletes, including files, to prevent stale
	// entries when a folder is created at the same path.
	if (event.kind === "delete") {
		nextState = deleteSubtree(state, event.absolutePath);
	}

	const nextInvalidated = new Set(nextState.invalidatedDirectories);
	nextInvalidated.add(parentPath);
	return {
		...nextState,
		invalidatedDirectories: nextInvalidated,
	};
}

// Simulates loadDirectory completing with new entries
function applyDirectoryListing(
	state: FileTreeState,
	directoryPath: string,
	entries: FsEntry[],
): FileTreeState {
	const nextEntries = new Map(state.entriesByPath);
	const nextChildren = new Map(state.childPathsByDirectory);
	const nextLoaded = new Set(state.loadedDirectories);
	const nextInvalidated = new Set(state.invalidatedDirectories);

	for (const entry of entries) {
		nextEntries.set(entry.absolutePath, entry);
	}

	nextChildren.set(
		directoryPath,
		entries.map((entry) => entry.absolutePath),
	);

	nextLoaded.add(directoryPath);
	nextInvalidated.delete(directoryPath);

	return {
		...state,
		childPathsByDirectory: nextChildren,
		entriesByPath: nextEntries,
		invalidatedDirectories: nextInvalidated,
		loadedDirectories: nextLoaded,
	};
}

function buildVisibleEntries(
	state: FileTreeState,
	rootPath: string,
): Array<{ absolutePath: string; kind: FsEntryKind; name: string }> {
	const childPaths = state.childPathsByDirectory.get(rootPath) ?? [];
	return childPaths
		.map((childPath) => {
			const entry = state.entriesByPath.get(childPath);
			if (!entry) return null;
			return {
				absolutePath: entry.absolutePath,
				kind: entry.kind,
				name: entry.name,
			};
		})
		.filter(
			(
				entry,
			): entry is { absolutePath: string; kind: FsEntryKind; name: string } =>
				entry !== null,
		);
}

// ─── Tests ───

describe("useFileTree state management — issue #2925", () => {
	const ROOT = "/workspace";
	const EXAMPLE_PATH = "/workspace/example";

	test("file delete event removes entry from entriesByPath", () => {
		let state = createInitialState();

		// Populate state as if we loaded a directory with a file named "example"
		state = applyDirectoryListing(state, ROOT, [
			{ absolutePath: EXAMPLE_PATH, name: "example", kind: "file" },
		]);

		expect(state.entriesByPath.has(EXAMPLE_PATH)).toBe(true);
		expect(state.entriesByPath.get(EXAMPLE_PATH)?.kind).toBe("file");

		// Delete the file
		state = handleFileSystemEvent(state, {
			kind: "delete",
			absolutePath: EXAMPLE_PATH,
			isDirectory: false,
		});

		// After fix: file entry should be removed from entriesByPath
		expect(state.entriesByPath.has(EXAMPLE_PATH)).toBe(false);
		expect(state.invalidatedDirectories.has(ROOT)).toBe(true);
	});

	test("file→folder replacement: folder entry replaces stale file entry", () => {
		let state = createInitialState();

		// Step 1: Load directory with a file named "example"
		state = applyDirectoryListing(state, ROOT, [
			{ absolutePath: EXAMPLE_PATH, name: "example", kind: "file" },
		]);

		const visibleBefore = buildVisibleEntries(state, ROOT);
		expect(visibleBefore).toHaveLength(1);
		expect(visibleBefore[0]?.kind).toBe("file");

		// Step 2: Delete the file
		state = handleFileSystemEvent(state, {
			kind: "delete",
			absolutePath: EXAMPLE_PATH,
			isDirectory: false,
		});

		// File entry should be removed immediately
		expect(state.entriesByPath.has(EXAMPLE_PATH)).toBe(false);

		// Step 3: Simulate loadDirectory after delete (listing is now empty)
		state = applyDirectoryListing(state, ROOT, []);
		expect(buildVisibleEntries(state, ROOT)).toHaveLength(0);

		// Step 4: Create a folder with the same name
		state = handleFileSystemEvent(state, {
			kind: "create",
			absolutePath: EXAMPLE_PATH,
			isDirectory: true,
		});

		// Step 5: Simulate loadDirectory after create (listing now has the folder)
		state = applyDirectoryListing(state, ROOT, [
			{ absolutePath: EXAMPLE_PATH, name: "example", kind: "directory" },
		]);

		// The visible entries should show a directory, not a stale file
		const visibleAfter = buildVisibleEntries(state, ROOT);
		expect(visibleAfter).toHaveLength(1);
		expect(visibleAfter[0]?.kind).toBe("directory");
		expect(visibleAfter[0]?.name).toBe("example");
	});

	test("file→folder replacement without intermediate reload", () => {
		let state = createInitialState();

		// Load directory with a file named "example"
		state = applyDirectoryListing(state, ROOT, [
			{ absolutePath: EXAMPLE_PATH, name: "example", kind: "file" },
		]);

		// Delete file event (no reload in between)
		state = handleFileSystemEvent(state, {
			kind: "delete",
			absolutePath: EXAMPLE_PATH,
			isDirectory: false,
		});

		// Create folder event immediately after (no reload in between)
		state = handleFileSystemEvent(state, {
			kind: "create",
			absolutePath: EXAMPLE_PATH,
			isDirectory: true,
		});

		// Parent should be invalidated
		expect(state.invalidatedDirectories.has(ROOT)).toBe(true);
		// Old file entry should NOT be in entriesByPath
		expect(state.entriesByPath.has(EXAMPLE_PATH)).toBe(false);

		// Now loadDirectory fires with the new listing (folder)
		state = applyDirectoryListing(state, ROOT, [
			{ absolutePath: EXAMPLE_PATH, name: "example", kind: "directory" },
		]);

		const visible = buildVisibleEntries(state, ROOT);
		expect(visible).toHaveLength(1);
		expect(visible[0]?.kind).toBe("directory");
	});

	test("directory delete still works correctly via deleteSubtree", () => {
		let state = createInitialState();

		// Load root with a directory
		state = applyDirectoryListing(state, ROOT, [
			{ absolutePath: EXAMPLE_PATH, name: "example", kind: "directory" },
		]);

		// Load the subdirectory with children
		state = applyDirectoryListing(state, EXAMPLE_PATH, [
			{
				absolutePath: `${EXAMPLE_PATH}/child.txt`,
				name: "child.txt",
				kind: "file",
			},
		]);

		// Mark the directory as expanded
		state = {
			...state,
			expandedDirectories: new Set([EXAMPLE_PATH]),
		};

		// Delete the directory
		state = handleFileSystemEvent(state, {
			kind: "delete",
			absolutePath: EXAMPLE_PATH,
			isDirectory: true,
		});

		// Directory, its children, and expansion state should all be cleaned up
		expect(state.entriesByPath.has(EXAMPLE_PATH)).toBe(false);
		expect(state.entriesByPath.has(`${EXAMPLE_PATH}/child.txt`)).toBe(false);
		expect(state.childPathsByDirectory.has(EXAMPLE_PATH)).toBe(false);
		expect(state.expandedDirectories.has(EXAMPLE_PATH)).toBe(false);
	});
});
