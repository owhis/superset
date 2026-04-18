import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { getBuiltInSlashCommands } from "./builtins";
import { parseSlashCommandFrontmatter } from "./frontmatter";
import type { SlashCommandRegistryEntry, SlashCommandSource } from "./types";

interface SlashCommandRegistryOptions {
	homeDirectory?: string;
	projectDirectory?: string;
	includeBuiltIns?: boolean;
	useCache?: boolean;
}

const REGISTRY_CACHE_TTL_MS = 1000;
const REGISTRY_CACHE_MAX_ENTRIES = 64;

interface ResolvedRegistryOptions {
	homeDirectory: string;
	projectDirectory: string;
	includeBuiltIns: boolean;
	useCache: boolean;
}

interface RegistryCacheValue {
	expiresAt: number;
	commands: SlashCommandRegistryEntry[];
}

interface RegistryCacheStats {
	hits: number;
	misses: number;
}

const registryCache = new Map<string, RegistryCacheValue>();
const registryCacheStats: RegistryCacheStats = {
	hits: 0,
	misses: 0,
};

function resolveRegistryOptions(
	cwd: string,
	options?: SlashCommandRegistryOptions,
): ResolvedRegistryOptions {
	return {
		homeDirectory: options?.homeDirectory ?? homedir(),
		projectDirectory: options?.projectDirectory ?? cwd,
		includeBuiltIns: options?.includeBuiltIns ?? true,
		useCache: options?.useCache ?? true,
	};
}

function getRegistryCacheKey(options: ResolvedRegistryOptions): string {
	return [
		options.projectDirectory,
		options.homeDirectory,
		options.includeBuiltIns ? "builtin:1" : "builtin:0",
	].join("|");
}

function cloneSlashCommandRegistryEntry(
	command: SlashCommandRegistryEntry,
): SlashCommandRegistryEntry {
	return {
		...command,
		aliases: [...command.aliases],
		action: command.action ? { ...command.action } : undefined,
	};
}

function cloneSlashCommandRegistry(
	commands: SlashCommandRegistryEntry[],
): SlashCommandRegistryEntry[] {
	return commands.map(cloneSlashCommandRegistryEntry);
}

function pruneRegistryCache(now = Date.now()): void {
	for (const [key, value] of registryCache) {
		if (value.expiresAt <= now) {
			registryCache.delete(key);
		}
	}
}

function readRegistryCache(
	cacheKey: string,
): SlashCommandRegistryEntry[] | null {
	pruneRegistryCache();
	const cached = registryCache.get(cacheKey);
	if (!cached) return null;
	return cloneSlashCommandRegistry(cached.commands);
}

function writeRegistryCache(
	cacheKey: string,
	commands: SlashCommandRegistryEntry[],
): void {
	pruneRegistryCache();
	registryCache.delete(cacheKey);
	while (registryCache.size >= REGISTRY_CACHE_MAX_ENTRIES) {
		const oldestKey = registryCache.keys().next().value;
		if (!oldestKey) break;
		registryCache.delete(oldestKey);
	}

	registryCache.set(cacheKey, {
		expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS,
		commands: cloneSlashCommandRegistry(commands),
	});
}

export function clearSlashCommandRegistryCache(): void {
	registryCache.clear();
	registryCacheStats.hits = 0;
	registryCacheStats.misses = 0;
}

export function getSlashCommandRegistryCacheStats(): RegistryCacheStats {
	return {
		hits: registryCacheStats.hits,
		misses: registryCacheStats.misses,
	};
}

function getCommandDirectoryEntries(options: ResolvedRegistryOptions): Array<{
	directory: string;
	source: SlashCommandSource;
}> {
	return [
		{
			directory: join(options.projectDirectory, ".claude", "commands"),
			source: "project",
		},
		{
			directory: join(options.projectDirectory, ".claude", "command"),
			source: "project",
		},
		{
			directory: join(options.projectDirectory, ".agents", "commands"),
			source: "project",
		},
		{
			directory: join(options.projectDirectory, ".agents", "command"),
			source: "project",
		},
		{
			directory: join(options.homeDirectory, ".claude", "commands"),
			source: "global",
		},
		{
			directory: join(options.homeDirectory, ".claude", "command"),
			source: "global",
		},
		{
			directory: join(options.homeDirectory, ".agents", "commands"),
			source: "global",
		},
		{
			directory: join(options.homeDirectory, ".agents", "command"),
			source: "global",
		},
	];
}

const SYMLINK_SHIM_MAX_BYTES = 1024;

function resolveCommandDirectory(candidate: string): string | null {
	if (!existsSync(candidate)) return null;

	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(candidate);
	} catch {
		return null;
	}

	if (stats.isDirectory()) return candidate;
	if (!stats.isFile() || stats.size > SYMLINK_SHIM_MAX_BYTES) return null;

	let contents: string;
	try {
		contents = readFileSync(candidate, "utf-8").trim();
	} catch {
		return null;
	}
	if (!contents || contents.includes("\n")) return null;

	const resolved = isAbsolute(contents)
		? contents
		: resolve(dirname(candidate), contents);

	try {
		if (!statSync(resolved).isDirectory()) return null;
	} catch {
		return null;
	}

	return resolved;
}

function listMarkdownFiles(directory: string): string[] {
	const markdownFiles: string[] = [];

	function visit(relativeDirectory: string): void {
		const absoluteDirectory = relativeDirectory
			? join(directory, relativeDirectory)
			: directory;

		const entries = readdirSync(absoluteDirectory, {
			withFileTypes: true,
		}).sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const relativePath = relativeDirectory
				? join(relativeDirectory, entry.name)
				: entry.name;

			if (entry.isDirectory()) {
				visit(relativePath);
				continue;
			}

			if (entry.isFile() && entry.name.endsWith(".md")) {
				markdownFiles.push(relativePath);
			}
		}
	}

	visit("");
	return markdownFiles;
}

function toCommandName(relativeFilePath: string): string {
	return relativeFilePath.replace(/\.md$/, "").split(sep).join("/");
}

function normalizeAliases(name: string, aliases: string[]): string[] {
	const normalizedName = name.toLowerCase();
	const seen = new Set<string>();
	const result: string[] = [];

	for (const alias of aliases) {
		const normalizedAlias = alias.trim().replace(/^\//, "");
		if (!normalizedAlias) continue;

		const key = normalizedAlias.toLowerCase();
		if (key === normalizedName) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(normalizedAlias);
	}

	return result;
}

export function buildSlashCommandRegistry(
	cwd: string,
	options?: SlashCommandRegistryOptions,
): SlashCommandRegistryEntry[] {
	const resolvedOptions = resolveRegistryOptions(cwd, options);
	const cacheKey = getRegistryCacheKey(resolvedOptions);
	if (resolvedOptions.useCache) {
		const cached = readRegistryCache(cacheKey);
		if (cached) {
			registryCacheStats.hits += 1;
			return cached;
		}
		registryCacheStats.misses += 1;
	}

	const commands: SlashCommandRegistryEntry[] = [];
	const seenNames = new Set<string>();

	for (const { directory, source } of getCommandDirectoryEntries(
		resolvedOptions,
	)) {
		const resolvedDirectory = resolveCommandDirectory(directory);
		if (!resolvedDirectory) continue;

		try {
			for (const fileName of listMarkdownFiles(resolvedDirectory)) {
				const name = toCommandName(fileName);
				if (seenNames.has(name)) continue;

				seenNames.add(name);
				const filePath = join(resolvedDirectory, fileName);
				const raw = readFileSync(filePath, "utf-8");
				const metadata = parseSlashCommandFrontmatter(raw);

				commands.push({
					name,
					aliases: normalizeAliases(name, metadata.aliases),
					description: metadata.description,
					argumentHint: metadata.argumentHint,
					kind: "custom",
					filePath,
					source,
				});
			}
		} catch (error) {
			console.warn(
				`[slash-commands] Failed to read commands from ${resolvedDirectory}:`,
				error,
			);
		}
	}

	if (resolvedOptions.includeBuiltIns) {
		for (const command of getBuiltInSlashCommands()) {
			if (seenNames.has(command.name)) continue;
			seenNames.add(command.name);
			commands.push({
				...command,
				aliases: normalizeAliases(command.name, command.aliases),
			});
		}
	}

	if (resolvedOptions.useCache) {
		writeRegistryCache(cacheKey, commands);
	}

	return cloneSlashCommandRegistry(commands);
}
