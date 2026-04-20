import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

/**
 * Tiny IO module that wraps the auth.json reads/writes used by the OAuth
 * helper. Lives in its own module so tests can mock JUST these functions
 * without globally mocking `node:fs` (which would break sibling tests in
 * the same bun process — `mock.module("node:fs", …)` is process-global).
 */

export type AuthDataReadResult =
	| { kind: "ok"; data: Record<string, unknown> }
	| { kind: "missing" }
	| { kind: "parse-error" };

/**
 * Resolves the mastracode auth.json path (same logic as mastracode's
 * `getAppDataDir`). We read it directly to avoid importing mastracode,
 * which eagerly loads @mastra/fastembed → onnxruntime-node (208 MB native
 * binary) and breaks electron-vite bundling.
 */
export function getAuthJsonPath(): string {
	const p = platform();
	let base: string;
	if (p === "darwin") {
		base = join(homedir(), "Library", "Application Support");
	} else if (p === "win32") {
		base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
	} else {
		base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	}
	return join(base, "mastracode", "auth.json");
}

export function readAuthJson(
	path: string = getAuthJsonPath(),
): AuthDataReadResult {
	if (!existsSync(path)) return { kind: "missing" };
	try {
		const data = JSON.parse(readFileSync(path, "utf-8")) as Record<
			string,
			unknown
		>;
		return { kind: "ok", data };
	} catch {
		return { kind: "parse-error" };
	}
}

/**
 * Atomically replace auth.json with `next`. The temp file is written to the
 * SAME directory as the target — `renameSync` across filesystems throws
 * `EXDEV` on Linux where /tmp is commonly a `tmpfs` mount separate from
 * $HOME, which would silently prevent persistence.
 *
 * `path` is injectable to keep tests off the user's real auth.json.
 */
export function writeAuthJson(
	next: Record<string, unknown>,
	path: string = getAuthJsonPath(),
): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmpPath = join(dir, `.auth.json.${process.pid}-${Date.now()}.tmp`);
	const serialized = JSON.stringify(next, null, 2);
	writeFileSync(tmpPath, serialized, { mode: 0o600 });
	renameSync(tmpPath, path);
}
