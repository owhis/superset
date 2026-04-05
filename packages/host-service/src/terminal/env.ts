/**
 * V2 terminal environment contract.
 *
 * Single source of truth for PTY env construction in host-service.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// ── Shell resolution ─────────────────────────────────────────────────

export function resolveLaunchShell(baseEnv: Record<string, string>): string {
	if (process.platform === "win32") {
		return baseEnv.COMSPEC || "cmd.exe";
	}
	return baseEnv.SHELL || "/bin/sh";
}

// ── Locale ───────────────────────────────────────────────────────────

export function normalizeUtf8Locale(baseEnv: Record<string, string>): string {
	if (baseEnv.LANG?.includes("UTF-8")) return baseEnv.LANG;
	if (baseEnv.LC_ALL?.includes("UTF-8")) return baseEnv.LC_ALL;
	return "en_US.UTF-8";
}

// ── Superset shell paths ─────────────────────────────────────────────

export function getSupersetShellPaths(supersetHomeDir: string): {
	BIN_DIR: string;
	ZSH_DIR: string;
	BASH_DIR: string;
} {
	return {
		BIN_DIR: path.join(supersetHomeDir, "bin"),
		ZSH_DIR: path.join(supersetHomeDir, "zsh"),
		BASH_DIR: path.join(supersetHomeDir, "bash"),
	};
}

// ── Shell name helper ────────────────────────────────────────────────

function getShellName(shell: string): string {
	return path.basename(shell);
}

// ── Fish init command (matches desktop shell-wrappers.ts) ────────────

function buildFishInitCommand(binDir: string): string {
	const escaped = binDir
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$");
	return `set -l _superset_bin "${escaped}"; contains -- "$_superset_bin" $PATH; or set -gx PATH "$_superset_bin" $PATH; function _superset_shell_ready --on-event fish_prompt; printf '\\033]777;superset-shell-ready\\007'; functions -e _superset_shell_ready; end`;
}

// ── Shell bootstrap env ──────────────────────────────────────────────

interface ShellBootstrapParams {
	shell: string;
	baseEnv: Record<string, string>;
	supersetHomeDir: string;
}

export function getShellBootstrapEnv(
	params: ShellBootstrapParams,
): Record<string, string> {
	const { shell, baseEnv, supersetHomeDir } = params;
	const shellName = getShellName(shell);
	const paths = getSupersetShellPaths(supersetHomeDir);

	if (shellName === "zsh") {
		const zshrc = path.join(paths.ZSH_DIR, ".zshrc");
		if (existsSync(zshrc)) {
			return {
				SUPERSET_ORIG_ZDOTDIR: baseEnv.ZDOTDIR || baseEnv.HOME || homedir(),
				ZDOTDIR: paths.ZSH_DIR,
			};
		}
	}

	return {};
}

// ── Shell launch args ────────────────────────────────────────────────

interface ShellLaunchParams {
	shell: string;
	supersetHomeDir: string;
}

export function getShellLaunchArgs(params: ShellLaunchParams): string[] {
	const { shell, supersetHomeDir } = params;
	const shellName = getShellName(shell);
	const paths = getSupersetShellPaths(supersetHomeDir);

	if (shellName === "zsh") {
		return ["-l"];
	}

	if (shellName === "bash") {
		const rcfile = path.join(paths.BASH_DIR, "rcfile");
		if (existsSync(rcfile)) {
			return ["--rcfile", rcfile];
		}
		return ["-l"];
	}

	if (shellName === "fish") {
		return ["-l", "--init-command", buildFishInitCommand(paths.BIN_DIR)];
	}

	if (shellName === "sh" || shellName === "ksh") {
		return ["-l"];
	}

	// Unsupported shells: launch natively without bootstrap
	return [];
}

// ── Runtime env stripping ────────────────────────────────────────────

/** Keys injected by desktop into host-service that must not leak to PTYs. */
const HOST_SERVICE_RUNTIME_KEYS = new Set([
	"AUTH_TOKEN",
	"CLOUD_API_URL",
	"DESKTOP_VITE_PORT",
	"DEVICE_CLIENT_ID",
	"DEVICE_NAME",
	"ELECTRON_RUN_AS_NODE",
	"HOST_DB_PATH",
	"HOST_MANIFEST_DIR",
	"HOST_MIGRATIONS_PATH",
	"HOST_SERVICE_SECRET",
	"HOST_SERVICE_VERSION",
	"KEEP_ALIVE_AFTER_PARENT",
	"ORGANIZATION_ID",
]);

/** Node/app keys that should not reach user terminals. */
const NODE_APP_KEYS = new Set(["NODE_ENV", "NODE_OPTIONS", "NODE_PATH"]);

/** Prefixes for build-tool env vars that must not leak. */
const STRIP_PREFIXES = ["VITE_", "NEXT_PUBLIC_", "TURBO_"];

/** Explicit Superset support keys to keep when present. */
const SUPERSET_KEEP_KEYS = new Set([
	"SUPERSET_HOME_DIR",
	"SUPERSET_AGENT_HOOK_PORT",
	"SUPERSET_AGENT_HOOK_VERSION",
]);

export function stripTerminalRuntimeEnv(
	baseEnv: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(baseEnv)) {
		// Remove host-service runtime keys
		if (HOST_SERVICE_RUNTIME_KEYS.has(key)) continue;

		// Remove Node/app keys
		if (NODE_APP_KEYS.has(key)) continue;

		// Remove build-tool prefix keys
		if (STRIP_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;

		// For SUPERSET_* keys: only keep explicitly allowed ones
		if (key.startsWith("SUPERSET_") && !SUPERSET_KEEP_KEYS.has(key)) continue;

		result[key] = value;
	}

	return result;
}

// ── V2 terminal env construction ─────────────────────────────────────

interface BuildV2TerminalEnvParams {
	baseEnv: Record<string, string>;
	shell: string;
	supersetHomeDir: string;
	cwd: string;
	terminalId: string;
	workspaceId: string;
	workspacePath: string;
	rootPath: string;
}

export function buildV2TerminalEnv(
	params: BuildV2TerminalEnvParams,
): Record<string, string> {
	const {
		baseEnv,
		shell,
		supersetHomeDir,
		cwd,
		terminalId,
		workspaceId,
		workspacePath,
		rootPath,
	} = params;

	// Start from stripped base
	const env = stripTerminalRuntimeEnv(baseEnv);

	// Merge shell bootstrap env
	const bootstrapEnv = getShellBootstrapEnv({
		shell,
		baseEnv,
		supersetHomeDir,
	});
	Object.assign(env, bootstrapEnv);

	// Public terminal surface
	env.TERM = "xterm-256color";
	env.TERM_PROGRAM = "Superset";
	env.TERM_PROGRAM_VERSION = baseEnv.HOST_SERVICE_VERSION || "unknown";
	env.COLORTERM = "truecolor";
	env.LANG = normalizeUtf8Locale(baseEnv);
	env.PWD = cwd;

	// Superset v2 metadata
	env.SUPERSET_TERMINAL_ID = terminalId;
	env.SUPERSET_WORKSPACE_ID = workspaceId;
	env.SUPERSET_WORKSPACE_PATH = workspacePath;
	env.SUPERSET_ROOT_PATH = rootPath;
	env.SUPERSET_ENV =
		baseEnv.NODE_ENV === "development" ? "development" : "production";

	// Explicit agent hook vars (from host-service process env, kept through strip)
	if (baseEnv.SUPERSET_AGENT_HOOK_PORT) {
		env.SUPERSET_AGENT_HOOK_PORT = baseEnv.SUPERSET_AGENT_HOOK_PORT;
	}
	if (baseEnv.SUPERSET_AGENT_HOOK_VERSION) {
		env.SUPERSET_AGENT_HOOK_VERSION = baseEnv.SUPERSET_AGENT_HOOK_VERSION;
	}

	return env;
}
