import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { describe, expect, mock, test } from "bun:test";
import {
	buildV2TerminalEnv,
	getShellBootstrapEnv,
	getShellLaunchArgs,
	getSupersetShellPaths,
	normalizeUtf8Locale,
	resolveLaunchShell,
	stripTerminalRuntimeEnv,
} from "./env";

// ── resolveLaunchShell ───────────────────────────────────────────────

describe("resolveLaunchShell", () => {
	test("returns SHELL from base env on non-Windows", () => {
		expect(resolveLaunchShell({ SHELL: "/usr/local/bin/fish" })).toBe(
			"/usr/local/bin/fish",
		);
	});

	test("falls back to /bin/sh when SHELL is absent", () => {
		expect(resolveLaunchShell({})).toBe("/bin/sh");
	});

	test("does not default to /bin/zsh", () => {
		expect(resolveLaunchShell({})).not.toBe("/bin/zsh");
	});
});

// ── normalizeUtf8Locale ──────────────────────────────────────────────

describe("normalizeUtf8Locale", () => {
	test("prefers LANG when it contains UTF-8", () => {
		expect(normalizeUtf8Locale({ LANG: "ja_JP.UTF-8" })).toBe("ja_JP.UTF-8");
	});

	test("falls back to LC_ALL", () => {
		expect(normalizeUtf8Locale({ LC_ALL: "fr_FR.UTF-8" })).toBe(
			"fr_FR.UTF-8",
		);
	});

	test("defaults to en_US.UTF-8", () => {
		expect(normalizeUtf8Locale({})).toBe("en_US.UTF-8");
	});
});

// ── stripTerminalRuntimeEnv ──────────────────────────────────────────

describe("stripTerminalRuntimeEnv", () => {
	const secretsEnv: Record<string, string> = {
		// Host-service runtime keys that must not leak
		AUTH_TOKEN: "secret-token",
		HOST_SERVICE_SECRET: "secret",
		ORGANIZATION_ID: "org-123",
		DEVICE_CLIENT_ID: "device-abc",
		DEVICE_NAME: "My Mac",
		ELECTRON_RUN_AS_NODE: "1",
		HOST_DB_PATH: "/tmp/host.db",
		HOST_MANIFEST_DIR: "/tmp/manifests",
		HOST_MIGRATIONS_PATH: "/tmp/migrations",
		HOST_SERVICE_VERSION: "1.2.3",
		KEEP_ALIVE_AFTER_PARENT: "1",
		CLOUD_API_URL: "https://api.example.com",
		DESKTOP_VITE_PORT: "5173",
		// Node/app keys
		NODE_ENV: "development",
		NODE_OPTIONS: "--max-old-space-size=4096",
		NODE_PATH: "/some/path",
		// Build-tool prefix keys
		VITE_API_URL: "http://localhost:3000",
		NEXT_PUBLIC_KEY: "pk_123",
		TURBO_TEAM: "my-team",
		// Legacy SUPERSET_* vars that should be stripped
		SUPERSET_PANE_ID: "pane-1",
		SUPERSET_TAB_ID: "tab-1",
		SUPERSET_PORT: "51741",
		SUPERSET_HOOK_VERSION: "2",
		SUPERSET_WORKSPACE_NAME: "my-ws",
		// Keys that SHOULD survive
		HOME: "/Users/test",
		PATH: "/usr/bin:/usr/local/bin",
		SHELL: "/bin/zsh",
		EDITOR: "vim",
		SUPERSET_HOME_DIR: "/Users/test/.superset",
		SUPERSET_AGENT_HOOK_PORT: "51741",
		SUPERSET_AGENT_HOOK_VERSION: "2",
	};

	test("app/runtime secrets do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.AUTH_TOKEN).toBeUndefined();
		expect(result.HOST_SERVICE_SECRET).toBeUndefined();
		expect(result.ORGANIZATION_ID).toBeUndefined();
		expect(result.DEVICE_CLIENT_ID).toBeUndefined();
		expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
		expect(result.HOST_DB_PATH).toBeUndefined();
		expect(result.CLOUD_API_URL).toBeUndefined();
		expect(result.DESKTOP_VITE_PORT).toBeUndefined();
	});

	test("host-service control vars do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.HOST_MANIFEST_DIR).toBeUndefined();
		expect(result.HOST_MIGRATIONS_PATH).toBeUndefined();
		expect(result.HOST_SERVICE_VERSION).toBeUndefined();
		expect(result.KEEP_ALIVE_AFTER_PARENT).toBeUndefined();
		expect(result.DEVICE_NAME).toBeUndefined();
	});

	test("Node/app keys are stripped", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.NODE_ENV).toBeUndefined();
		expect(result.NODE_OPTIONS).toBeUndefined();
		expect(result.NODE_PATH).toBeUndefined();
	});

	test("build-tool prefix keys are stripped", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.VITE_API_URL).toBeUndefined();
		expect(result.NEXT_PUBLIC_KEY).toBeUndefined();
		expect(result.TURBO_TEAM).toBeUndefined();
	});

	test("removed legacy vars do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.SUPERSET_PANE_ID).toBeUndefined();
		expect(result.SUPERSET_TAB_ID).toBeUndefined();
		expect(result.SUPERSET_PORT).toBeUndefined();
		expect(result.SUPERSET_HOOK_VERSION).toBeUndefined();
		expect(result.SUPERSET_WORKSPACE_NAME).toBeUndefined();
	});

	test("user shell env vars survive stripping", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.HOME).toBe("/Users/test");
		expect(result.PATH).toBe("/usr/bin:/usr/local/bin");
		expect(result.SHELL).toBe("/bin/zsh");
		expect(result.EDITOR).toBe("vim");
	});

	test("explicit Superset support keys are kept", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.SUPERSET_HOME_DIR).toBe("/Users/test/.superset");
		expect(result.SUPERSET_AGENT_HOOK_PORT).toBe("51741");
		expect(result.SUPERSET_AGENT_HOOK_VERSION).toBe("2");
	});

	test("shell-derived env preserves user tooling vars", () => {
		const shellEnv: Record<string, string> = {
			HOME: "/Users/dev",
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin",
			SHELL: "/bin/zsh",
			NVM_DIR: "/Users/dev/.nvm",
			PYENV_ROOT: "/Users/dev/.pyenv",
			GOPATH: "/Users/dev/go",
			SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
		};
		const result = stripTerminalRuntimeEnv(shellEnv);
		expect(result.NVM_DIR).toBe("/Users/dev/.nvm");
		expect(result.PYENV_ROOT).toBe("/Users/dev/.pyenv");
		expect(result.GOPATH).toBe("/Users/dev/go");
		expect(result.SSH_AUTH_SOCK).toBe("/tmp/ssh-agent.sock");
	});
});

// ── Shell launch behavior ────────────────────────────────────────────

describe("getShellLaunchArgs", () => {
	const supersetHomeDir = "/tmp/test-superset";

	test("zsh launches as login shell", () => {
		expect(
			getShellLaunchArgs({ shell: "/bin/zsh", supersetHomeDir }),
		).toEqual(["-l"]);
	});

	test("bash uses rcfile when present", () => {
		// This test depends on actual filesystem — check for existence
		const args = getShellLaunchArgs({ shell: "/bin/bash", supersetHomeDir });
		// With a non-existent supersetHomeDir, should fall back to login shell
		expect(args).toEqual(["-l"]);
	});

	test("fish uses init-command", () => {
		const args = getShellLaunchArgs({ shell: "/usr/bin/fish", supersetHomeDir });
		expect(args[0]).toBe("-l");
		expect(args[1]).toBe("--init-command");
		expect(args[2]).toContain("_superset_bin");
		expect(args[2]).toContain("superset-shell-ready");
	});

	test("sh launches as login shell", () => {
		expect(getShellLaunchArgs({ shell: "/bin/sh", supersetHomeDir })).toEqual([
			"-l",
		]);
	});

	test("ksh launches as login shell", () => {
		expect(
			getShellLaunchArgs({ shell: "/usr/bin/ksh", supersetHomeDir }),
		).toEqual(["-l"]);
	});

	test("unsupported shells launch natively without bootstrap", () => {
		expect(
			getShellLaunchArgs({ shell: "/usr/bin/pwsh", supersetHomeDir }),
		).toEqual([]);
	});
});

describe("getShellBootstrapEnv", () => {
	test("zsh bootstrap applies only when wrapper files exist", () => {
		// Non-existent supersetHomeDir: should return empty
		const result = getShellBootstrapEnv({
			shell: "/bin/zsh",
			baseEnv: { HOME: "/Users/test" },
			supersetHomeDir: "/tmp/nonexistent-superset-dir",
		});
		expect(result).toEqual({});
	});

	test("bash returns no bootstrap env keys", () => {
		const result = getShellBootstrapEnv({
			shell: "/bin/bash",
			baseEnv: {},
			supersetHomeDir: "/tmp/test",
		});
		expect(result).toEqual({});
	});

	test("fish returns no bootstrap env keys", () => {
		const result = getShellBootstrapEnv({
			shell: "/usr/bin/fish",
			baseEnv: {},
			supersetHomeDir: "/tmp/test",
		});
		expect(result).toEqual({});
	});

	test("unsupported shells return no bootstrap env", () => {
		const result = getShellBootstrapEnv({
			shell: "/usr/bin/pwsh",
			baseEnv: {},
			supersetHomeDir: "/tmp/test",
		});
		expect(result).toEqual({});
	});
});

// ── buildV2TerminalEnv ───────────────────────────────────────────────

describe("buildV2TerminalEnv", () => {
	const baseParams = {
		baseEnv: {
			HOME: "/Users/test",
			PATH: "/usr/bin",
			SHELL: "/bin/zsh",
			HOST_SERVICE_VERSION: "2.0.0",
			SUPERSET_HOME_DIR: "/Users/test/.superset",
			SUPERSET_AGENT_HOOK_PORT: "51741",
			SUPERSET_AGENT_HOOK_VERSION: "2",
			NODE_ENV: "production",
			// Secrets that must not leak
			AUTH_TOKEN: "secret",
			HOST_SERVICE_SECRET: "secret",
		},
		shell: "/bin/zsh",
		supersetHomeDir: "/Users/test/.superset",
		cwd: "/tmp/workspace",
		terminalId: "term-1",
		workspaceId: "ws-1",
		workspacePath: "/tmp/workspace",
		rootPath: "/tmp/repo",
	};

	test("v2 Superset metadata is present", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.SUPERSET_TERMINAL_ID).toBe("term-1");
		expect(env.SUPERSET_WORKSPACE_ID).toBe("ws-1");
		expect(env.SUPERSET_WORKSPACE_PATH).toBe("/tmp/workspace");
		expect(env.SUPERSET_AGENT_HOOK_PORT).toBe("51741");
		expect(env.SUPERSET_AGENT_HOOK_VERSION).toBe("2");
	});

	test("TERM_PROGRAM=Superset and UTF-8 locale are present", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.TERM_PROGRAM).toBe("Superset");
		expect(env.TERM_PROGRAM_VERSION).toBe("2.0.0");
		expect(env.LANG).toContain("UTF-8");
	});

	test("SUPERSET_ROOT_PATH is populated when project data is available", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.SUPERSET_ROOT_PATH).toBe("/tmp/repo");
	});

	test("missing root path degrades to empty string", () => {
		const env = buildV2TerminalEnv({ ...baseParams, rootPath: "" });
		expect(env.SUPERSET_ROOT_PATH).toBe("");
	});

	test("secrets do not leak through buildV2TerminalEnv", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.AUTH_TOKEN).toBeUndefined();
		expect(env.HOST_SERVICE_SECRET).toBeUndefined();
	});

	test("SUPERSET_ENV reflects NODE_ENV correctly", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.SUPERSET_ENV).toBe("production");

		const devEnv = buildV2TerminalEnv({
			...baseParams,
			baseEnv: { ...baseParams.baseEnv, NODE_ENV: "development" },
		});
		expect(devEnv.SUPERSET_ENV).toBe("development");
	});

	test("does not include legacy v1 vars", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			baseEnv: {
				...baseParams.baseEnv,
				SUPERSET_PANE_ID: "pane-1",
				SUPERSET_TAB_ID: "tab-1",
				SUPERSET_PORT: "51741",
				SUPERSET_HOOK_VERSION: "2",
			},
		});
		expect(env.SUPERSET_PANE_ID).toBeUndefined();
		expect(env.SUPERSET_TAB_ID).toBeUndefined();
		expect(env.SUPERSET_PORT).toBeUndefined();
		expect(env.SUPERSET_HOOK_VERSION).toBeUndefined();
	});

	test("does not include SUPERSET_WORKSPACE_NAME", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			baseEnv: {
				...baseParams.baseEnv,
				SUPERSET_WORKSPACE_NAME: "my-workspace",
			},
		});
		expect(env.SUPERSET_WORKSPACE_NAME).toBeUndefined();
	});

	test("PWD reflects the launch cwd", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.PWD).toBe("/tmp/workspace");
	});

	test("preserves user shell vars from base env", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			baseEnv: {
				...baseParams.baseEnv,
				NVM_DIR: "/Users/test/.nvm",
				SSH_AUTH_SOCK: "/tmp/ssh.sock",
			},
		});
		expect(env.NVM_DIR).toBe("/Users/test/.nvm");
		expect(env.SSH_AUTH_SOCK).toBe("/tmp/ssh.sock");
	});
});

// ── Integration-level: env never degenerates to raw process.env ──────

describe("v2 env contract boundary", () => {
	test("when fallback env is filtered, it does not contain raw process.env secrets", () => {
		// Simulate a host-service process.env that contains runtime secrets
		const hostServiceProcessEnv: Record<string, string> = {
			HOME: "/Users/test",
			PATH: "/usr/bin",
			SHELL: "/bin/zsh",
			HOST_SERVICE_SECRET: "top-secret",
			AUTH_TOKEN: "bearer-xyz",
			ORGANIZATION_ID: "org-abc",
			NODE_ENV: "production",
			VITE_SECRET: "vite-key",
		};

		const ptyEnv = buildV2TerminalEnv({
			baseEnv: hostServiceProcessEnv,
			shell: "/bin/zsh",
			supersetHomeDir: "/Users/test/.superset",
			cwd: "/tmp/ws",
			terminalId: "t-1",
			workspaceId: "w-1",
			workspacePath: "/tmp/ws",
			rootPath: "",
		});

		// None of the runtime secrets should be present
		expect(ptyEnv.HOST_SERVICE_SECRET).toBeUndefined();
		expect(ptyEnv.AUTH_TOKEN).toBeUndefined();
		expect(ptyEnv.ORGANIZATION_ID).toBeUndefined();
		expect(ptyEnv.NODE_ENV).toBeUndefined();
		expect(ptyEnv.VITE_SECRET).toBeUndefined();

		// But user shell vars remain
		expect(ptyEnv.HOME).toBe("/Users/test");
		expect(ptyEnv.PATH).toBe("/usr/bin");
		expect(ptyEnv.SHELL).toBe("/bin/zsh");
	});
});
