import { describe, expect, test } from "bun:test";
import { parseNumstat } from "../src/trpc/router/git/utils/git-helpers";

describe("parseNumstat", () => {
	test("regular file entry", () => {
		const raw = "5\t2\tsrc/foo.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({ additions: 5, deletions: 2 });
	});

	test("multiple regular entries", () => {
		const raw = "5\t2\tsrc/foo.ts\x003\t0\tsrc/bar.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({ additions: 5, deletions: 2 });
		expect(result.get("src/bar.ts")).toEqual({ additions: 3, deletions: 0 });
	});

	test("exact rename with edits indexes both paths", () => {
		const raw = "4\t3\t\x00src/old.ts\x00src/new.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/new.ts")).toEqual({ additions: 4, deletions: 3 });
		expect(result.get("src/old.ts")).toEqual({ additions: 4, deletions: 3 });
	});

	test("pure rename with zero line changes", () => {
		const raw = "0\t0\t\x00src/old.ts\x00src/new.ts\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/new.ts")).toEqual({ additions: 0, deletions: 0 });
		expect(result.get("src/old.ts")).toEqual({ additions: 0, deletions: 0 });
	});

	test("binary file with dash markers", () => {
		const raw = "-\t-\tassets/image.png\0";
		const result = parseNumstat(raw);
		expect(result.get("assets/image.png")).toEqual({
			additions: 0,
			deletions: 0,
		});
	});

	test("mixed regular, rename, and binary", () => {
		const raw =
			"5\t2\tsrc/foo.ts\x00" +
			"4\t3\t\x00src/old.ts\x00src/new.ts\x00" +
			"-\t-\tassets/image.png\x00";
		const result = parseNumstat(raw);
		expect(result.get("src/foo.ts")).toEqual({ additions: 5, deletions: 2 });
		expect(result.get("src/new.ts")).toEqual({ additions: 4, deletions: 3 });
		expect(result.get("src/old.ts")).toEqual({ additions: 4, deletions: 3 });
		expect(result.get("assets/image.png")).toEqual({
			additions: 0,
			deletions: 0,
		});
	});

	test("empty input returns empty map", () => {
		expect(parseNumstat("")).toEqual(new Map());
	});

	test("path containing tab is preserved as-is", () => {
		const raw = "1\t1\tweird\tpath.ts\0";
		const result = parseNumstat(raw);
		expect(result.get("weird\tpath.ts")).toEqual({
			additions: 1,
			deletions: 1,
		});
	});
});
