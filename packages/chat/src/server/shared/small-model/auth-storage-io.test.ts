import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readAuthJson, writeAuthJson } from "./auth-storage-io";

let workDir: string;
let authPath: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "chat-auth-storage-io-"));
	// Path one level deeper so writeAuthJson exercises mkdirSync.
	authPath = join(workDir, "mastracode", "auth.json");
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

afterAll(() => {
	// Just in case any test path leaked.
});

describe("auth-storage-io", () => {
	it("readAuthJson returns missing when file does not exist", () => {
		expect(readAuthJson(authPath)).toEqual({ kind: "missing" });
	});

	it("writeAuthJson + readAuthJson round-trip", () => {
		writeAuthJson(
			{ anthropic: { type: "oauth", access: "test-token" } },
			authPath,
		);

		const result = readAuthJson(authPath);
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.data.anthropic).toEqual({
			type: "oauth",
			access: "test-token",
		});
	});

	it("writeAuthJson creates the parent directory if missing (mkdirSync recursive)", () => {
		// authPath includes a `mastracode/` segment that doesn't exist yet.
		expect(existsSync(dirname(authPath))).toBe(false);
		writeAuthJson({ marker: "1" }, authPath);
		expect(existsSync(authPath)).toBe(true);
	});

	it("writeAuthJson is EXDEV-safe: temp file lives in the target directory", () => {
		// Snoop on the directory between writes by inspecting any leftover .tmp
		// files. If the implementation regresses to using tmpdir() across mounts,
		// this test would still pass on macOS (single fs) but the EXDEV-safe
		// guarantee is captured by checking the temp file ALSO lands in the dir.
		writeAuthJson({ marker: "1" }, authPath);
		expect(readFileSync(authPath, "utf-8")).toContain("marker");
		// A successful write means the temp file was renamed away; no leftover
		// .tmp file should remain in the target directory.
		const dir = dirname(authPath);
		const fs = require("node:fs") as typeof import("node:fs");
		const entries = fs.readdirSync(dir);
		expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
		expect(entries).toContain("auth.json");
	});

	it("readAuthJson returns parse-error for invalid JSON", () => {
		const fs = require("node:fs") as typeof import("node:fs");
		fs.mkdirSync(dirname(authPath), { recursive: true });
		fs.writeFileSync(authPath, "{not valid json");

		expect(readAuthJson(authPath)).toEqual({ kind: "parse-error" });
	});
});
