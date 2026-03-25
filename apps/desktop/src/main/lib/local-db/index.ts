import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@superset/local-db";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { app } from "electron";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { env } from "../../env.main";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "../app-environment";

const DB_PATH = join(SUPERSET_HOME_DIR, "local.db");

ensureSupersetHomeDirExists();

/**
 * Gets the migrations directory path.
 *
 * Path resolution strategy:
 * - Production (packaged .app): resources/migrations/
 * - Development (NODE_ENV=development): packages/local-db/drizzle/
 * - Preview (electron-vite preview): dist/resources/migrations/
 * - Test environment: Use monorepo path relative to __dirname
 */
function getMigrationsDirectory(): string {
	// Check if running in Electron (app.getAppPath exists)
	const isElectron =
		typeof app?.getAppPath === "function" &&
		typeof app?.isPackaged === "boolean";

	if (isElectron && app.isPackaged) {
		return join(process.resourcesPath, "resources/migrations");
	}

	const isDev = env.NODE_ENV === "development";

	if (isElectron && isDev) {
		// Development: source files in monorepo
		return join(app.getAppPath(), "../../packages/local-db/drizzle");
	}

	// Preview mode or test: __dirname is dist/main, so go up one level to dist/resources/migrations
	const previewPath = join(__dirname, "../resources/migrations");
	if (existsSync(previewPath)) {
		return previewPath;
	}

	// Fallback: try monorepo path (for tests or dev without Electron)
	// From apps/desktop/src/main/lib/local-db -> packages/local-db/drizzle
	const monorepoPath = join(
		__dirname,
		"../../../../../packages/local-db/drizzle",
	);
	if (existsSync(monorepoPath)) {
		return monorepoPath;
	}

	// Try Electron app path if available
	if (isElectron) {
		const srcPath = join(app.getAppPath(), "../../packages/local-db/drizzle");
		if (existsSync(srcPath)) {
			return srcPath;
		}
	}

	console.warn(`[local-db] Migrations directory not found at: ${previewPath}`);
	return previewPath;
}

const migrationsFolder = getMigrationsDirectory();

const sqlite = new Database(DB_PATH);
try {
	chmodSync(DB_PATH, SUPERSET_SENSITIVE_FILE_MODE);
} catch {
	// Best-effort; directory permissions should still protect the DB.
}
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = OFF");
sqlite.function("uuid_v4", () => randomUUID());
sqlite.function("uuid_is_valid_v4", (value: unknown) => {
	if (typeof value !== "string") return 0;
	if (!uuidValidate(value)) return 0;
	return uuidVersion(value) === 4 ? 1 : 0;
});

console.log(`[local-db] Database initialized at: ${DB_PATH}`);
console.log(`[local-db] Running migrations from: ${migrationsFolder}`);

export const localDb = drizzle(sqlite, { schema });

try {
	migrate(localDb, { migrationsFolder });
} catch (error) {
	console.error("[local-db] Migration failed:", error);
}

console.log("[local-db] Migrations complete");

// Repair worktrees/workspaces where branch was incorrectly set to "[gone]"
// due to a parser bug in parsePortelainStatus (see git.ts fix).
try {
	const corruptedWorktrees = sqlite
		.prepare(
			"SELECT id, path FROM worktrees WHERE branch = '[gone]'",
		)
		.all() as { id: string; path: string }[];

	for (const wt of corruptedWorktrees) {
		let realBranch: string | null = null;
		try {
			const dotGit = readFileSync(join(wt.path, ".git"), "utf-8").trim();
			const gitdir = dotGit.replace("gitdir: ", "");
			const head = readFileSync(join(gitdir, "HEAD"), "utf-8").trim();
			const match = head.match(/^ref: refs\/heads\/(.+)$/);
			if (match) {
				realBranch = match[1];
			}
		} catch {
			// Worktree may no longer exist on disk — skip
		}

		if (realBranch) {
			sqlite
				.prepare("UPDATE worktrees SET branch = ? WHERE id = ?")
				.run(realBranch, wt.id);
			sqlite
				.prepare(
					"UPDATE workspaces SET branch = ? WHERE worktree_id = ? AND branch = '[gone]'",
				)
				.run(realBranch, wt.id);
			console.log(
				`[local-db] Repaired branch for worktree ${wt.id}: [gone] → ${realBranch}`,
			);
		}
	}

	if (corruptedWorktrees.length > 0) {
		console.log(
			`[local-db] Repaired ${corruptedWorktrees.length} corrupted worktree branch(es)`,
		);
	}
} catch (error) {
	console.warn("[local-db] Branch repair failed (non-fatal):", error);
}

export type LocalDb = typeof localDb;
