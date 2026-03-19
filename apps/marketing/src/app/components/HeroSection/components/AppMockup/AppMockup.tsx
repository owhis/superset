"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
	LuChevronDown,
	LuFile,
	LuFilePlus,
	LuFolder,
	LuFolderGit2,
	LuGitPullRequest,
	LuPencil,
	LuPlus,
	LuTerminal,
	LuX,
} from "react-icons/lu";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function AsciiSpinner({ className }: { className?: string }) {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
		}, 80);
		return () => clearInterval(interval);
	}, []);

	return (
		<span className={`select-none font-mono text-[#D97757]/80 ${className}`}>
			{SPINNER_FRAMES[frameIndex]}
		</span>
	);
}

function StatusIndicator({
	status,
}: {
	status: "permission" | "working" | "review";
}) {
	const config = {
		permission: { ping: "bg-red-400/45", dot: "bg-red-400/80", pulse: true },
		working: {
			ping: "bg-[#D97757]/35",
			dot: "bg-[#D97757]/80",
			pulse: true,
		},
		review: { ping: "", dot: "bg-emerald-400/75", pulse: false },
	}[status];

	return (
		<span className="relative flex size-1.5 shrink-0">
			{config.pulse && (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.ping}`}
				/>
			)}
			<span
				className={`relative inline-flex size-1.5 rounded-full ${config.dot}`}
			/>
		</span>
	);
}

const WORKSPACES = [
	{
		name: "use any agents",
		branch: "use-any-agents",
		add: 46,
		del: 1,
		pr: "#733",
		isActive: true,
		status: "working" as const,
	},
	{
		name: "create parallel branches",
		branch: "create-parallel-branches",
		add: 193,
		del: 0,
		pr: "#815",
		status: "review" as const,
	},
	{
		name: "see changes",
		branch: "see-changes",
		add: 394,
		del: 23,
		pr: "#884",
	},
	{
		name: "open in any IDE",
		branch: "open-in-any-ide",
		add: 33,
		del: 0,
		pr: "#816",
		status: "permission" as const,
	},
	{
		name: "forward ports",
		branch: "forward-ports",
		add: 127,
		del: 8,
		pr: "#902",
	},
];

const FILE_CHANGES = [
	{ path: "bun.lock", add: 38, del: 25, type: "edit" },
	{ path: "packages/db/src/schema", type: "folder" },
	{ path: "cloud-workspace.ts", add: 119, del: 0, type: "add", indent: 1 },
	{ path: "enums.ts", add: 21, del: 0, type: "edit", indent: 1 },
	{ path: "apps/desktop/src/renderer", type: "folder" },
	{ path: "CloudTerminal.tsx", add: 169, del: 0, type: "add", indent: 1 },
	{ path: "useCloudWorkspaces.ts", add: 84, del: 0, type: "add", indent: 1 },
	{ path: "WorkspaceSidebar.tsx", add: 14, del: 0, type: "edit", indent: 1 },
	{ path: "apps/api/src/trpc/routers", type: "folder" },
	{ path: "ssh-manager.ts", add: 277, del: 0, type: "add", indent: 1 },
	{ path: "index.ts", add: 7, del: 0, type: "edit", indent: 1 },
];

const PORTS = [
	{ workspace: "use any agents", ports: ["3002"] },
	{
		workspace: "see changes",
		ports: ["3000", "3001", "5678"],
	},
];

function WorkspaceItem({
	name,
	branch,
	add,
	del,
	pr,
	isActive,
	status,
}: {
	name: string;
	branch: string;
	add?: number;
	del?: number;
	pr?: string;
	isActive?: boolean;
	status?: "permission" | "working" | "review";
}) {
	return (
		<div
			className={`relative flex cursor-pointer items-start gap-3 px-3 py-2 text-[11px] ${isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"}`}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-[#D97757]/80" />
			)}
			<div className="relative mt-0.5 text-muted-foreground/30">
				{status === "working" ? (
					<AsciiSpinner className="text-xs" />
				) : (
					<LuFolderGit2 className="size-4" />
				)}
				{status && status !== "working" && (
					<span className="absolute -top-0.5 -right-0.5">
						<StatusIndicator status={status} />
					</span>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between gap-1">
					<span
						className={`truncate ${isActive ? "text-foreground font-medium" : "text-foreground/55"}`}
					>
						{name}
					</span>
					{(add !== undefined || pr) && (
						<div className="flex items-center gap-1 shrink-0">
							{add !== undefined && (
								<span className="text-[10px] font-medium tabular-nums">
									<span className="text-emerald-300/75">+{add}</span>
									{del !== undefined && del > 0 && (
										<span className="ml-0.5 text-rose-300/75">-{del}</span>
									)}
								</span>
							)}
						</div>
					)}
				</div>
				<div className="flex items-center justify-between">
					<span className="truncate font-mono text-[10px] text-muted-foreground/28">
						{branch}
					</span>
					{pr && (
						<span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/24">
							<LuGitPullRequest className="size-3" />
							{pr}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function FileChangeItem({
	path,
	add = 0,
	del = 0,
	indent = 0,
	type,
}: {
	path: string;
	add?: number;
	del?: number;
	indent?: number;
	type: string;
}) {
	const Icon =
		type === "folder"
			? LuFolder
			: type === "add"
				? LuFilePlus
				: type === "edit"
					? LuPencil
					: LuFile;
	const iconColor =
		type === "add"
			? "text-emerald-300/70"
			: type === "edit"
				? "text-[#D97757]/65"
				: "text-muted-foreground/30";

	const isFolder = type === "folder";

	return (
		<div
			className={`flex items-center justify-between gap-2.5 px-4 hover:bg-white/[0.03] ${isFolder ? "mt-1.5 py-2" : "py-1.5"}`}
			style={{ paddingLeft: `${12 + (indent || 0) * 16}px` }}
		>
			<div className="flex items-center gap-2 min-w-0">
				<Icon className={`size-3.5 shrink-0 ${iconColor}`} />
				<span
					className={`truncate ${isFolder ? "text-[10px] font-medium text-muted-foreground/34" : "text-[11px] text-muted-foreground/58"}`}
				>
					{path}
				</span>
			</div>
			{!isFolder && (add > 0 || del > 0) && (
				<span className="shrink-0 tabular-nums text-[10px] font-medium">
					{add > 0 && <span className="text-emerald-300/75">+{add}</span>}
					{del > 0 && <span className="ml-1 text-rose-300/75">-{del}</span>}
				</span>
			)}
		</div>
	);
}

export type ActiveDemo =
	| "Use Any Agents"
	| "Create Parallel Branches"
	| "See Changes"
	| "Open in Any IDE";

interface AppMockupProps {
	activeDemo?: ActiveDemo;
}

export function AppMockup({ activeDemo = "Use Any Agents" }: AppMockupProps) {
	return (
		<div
			className="relative w-full min-w-[700px] rounded-2xl overflow-hidden bg-black/60 backdrop-blur-xl shadow-[0_8px_60px_-12px_rgba(0,0,0,0.7)]"
			style={{ aspectRatio: "16/10" }}
		>
			{/* Diagonal gradient glass border */}
			<div
				className="absolute inset-0 rounded-2xl pointer-events-none z-10"
				style={{
					background:
						"linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.02) 75%, rgba(255,255,255,0.15) 100%)",
					mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					WebkitMask:
						"linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					maskComposite: "exclude",
					WebkitMaskComposite: "xor",
					padding: "1.5px",
				}}
			/>
			{/* Window chrome */}
			<div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur-md">
				<div className="flex items-center gap-1.5">
					<div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
					<div className="w-3 h-3 rounded-full bg-[#febc2e]" />
					<div className="w-3 h-3 rounded-full bg-[#28c840]" />
				</div>
				<span className="text-[12px] font-medium text-muted-foreground/55">
					superset
				</span>
				<div className="w-12" />
			</div>

			<div className="flex h-[calc(100%-40px)]">
				{/* Left sidebar */}
				<div className="w-[210px] bg-white/[0.02] backdrop-blur-lg border-r border-white/[0.06] flex flex-col shrink-0">
					{/* New Workspace button */}
					<div className="border-b border-white/[0.06] px-3 py-3">
						<button
							type="button"
							className="flex w-full cursor-pointer items-center gap-2 rounded-xs px-2.5 py-1.5 text-[11px] text-muted-foreground/42 hover:bg-white/[0.025] hover:text-muted-foreground/60"
						>
							<LuPlus className="size-4" />
							<span>New Workspace</span>
						</button>
					</div>

					{/* Repository section */}
					<div className="flex cursor-pointer items-center justify-between border-b border-white/[0.06] px-3 py-2.5 hover:bg-white/[0.04]">
						<div className="flex items-center gap-2">
							<span className="text-[12px] font-medium text-foreground/72">
								superset
							</span>
							<span className="text-[10px] text-muted-foreground/28">(5)</span>
						</div>
						<div className="flex items-center gap-1 text-muted-foreground/30">
							<LuPlus className="size-3.5" />
							<LuChevronDown className="size-3.5" />
						</div>
					</div>

					{/* Workspace list */}
					<div className="flex-1 overflow-hidden">
						{/* New workspace - shown when "Create Parallel Branches" is active */}
						<motion.div
							className="overflow-hidden"
							initial={{ height: 0, opacity: 0 }}
							animate={{
								height: activeDemo === "Create Parallel Branches" ? "auto" : 0,
								opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
							}}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
							<div className="relative flex items-start gap-3 border-l-2 border-[#D97757]/70 bg-[#D97757]/[0.08] px-3 py-2 text-[11px]">
								<div className="mt-0.5 text-muted-foreground/50 relative">
									<AsciiSpinner className="text-[11px]" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-1">
										<span className="truncate text-foreground font-medium">
											new workspace
										</span>
									</div>
									<span className="truncate font-mono text-[10px] text-muted-foreground/42">
										creating...
									</span>
								</div>
							</div>
						</motion.div>
						{WORKSPACES.map((ws) => {
							const isFirstItem = ws.name === "use any agents";
							const shouldHideActiveState =
								isFirstItem && activeDemo === "Create Parallel Branches";
							return (
								<WorkspaceItem
									key={ws.branch}
									name={ws.name}
									branch={ws.branch}
									add={ws.add}
									del={ws.del}
									pr={ws.pr}
									isActive={shouldHideActiveState ? false : ws.isActive}
									status={shouldHideActiveState ? undefined : ws.status}
								/>
							);
						})}
					</div>

					{/* Ports section */}
					<div className="mb-2 border-t border-white/[0.06]">
						<div className="flex items-center justify-between px-3 py-2.5">
							<div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/36">
								<span>⌥</span>
								<span>Ports</span>
							</div>
							<span className="text-[10px] text-muted-foreground/28">4</span>
						</div>
						{PORTS.map((port) => (
							<div key={port.workspace} className="px-3 py-1.5">
								<div className="flex items-center justify-between text-[10px]">
									<span className="truncate text-muted-foreground/30">
										{port.workspace}
									</span>
									<LuX className="size-3 text-muted-foreground/20" />
								</div>
								<div className="mt-1 flex flex-wrap gap-1.5">
									{port.ports.map((p) => (
										<span
											key={p}
											className="rounded-xs border border-white/[0.05] bg-white/[0.02] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground/40"
										>
											{p}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Main content area */}
				<div className="flex min-w-0 flex-1 flex-col">
					{/* Tab bar */}
					<div className="flex items-center gap-1 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 backdrop-blur-md">
						{/* Claude tab - always visible, active */}
						<div className="flex items-center gap-1.5 rounded-t-xs border-b-2 border-[#D97757]/75 bg-[#D97757]/[0.05] px-4 py-1.5 text-[11px] font-medium text-foreground/90">
							{activeDemo === "Create Parallel Branches" ? (
								<>
									<LuTerminal className="size-3.5 text-muted-foreground/70" />
									<span>setup</span>
								</>
							) : (
								<>
									<Image
										src="/app-icons/claude.svg"
										alt="Claude"
										width={14}
										height={14}
									/>
									<span>claude</span>
								</>
							)}
							<LuX className="size-3.5 text-muted-foreground/30 hover:text-muted-foreground/50" />
						</div>
						{/* Other agent tabs - shown when "Use Any Agents" is active */}
						<motion.div
							className="flex items-center gap-1.5 overflow-hidden rounded-t-xs py-1.5 text-[11px] text-muted-foreground/38 hover:bg-white/[0.03]"
							initial={{
								opacity: 0,
								width: 0,
								paddingLeft: 0,
								paddingRight: 0,
							}}
							animate={{
								opacity: activeDemo === "Use Any Agents" ? 1 : 0,
								width: activeDemo === "Use Any Agents" ? "auto" : 0,
								paddingLeft: activeDemo === "Use Any Agents" ? 14 : 0,
								paddingRight: activeDemo === "Use Any Agents" ? 14 : 0,
							}}
							transition={{
								duration: 0.25,
								ease: "easeOut",
								delay: activeDemo === "Use Any Agents" ? 0.1 : 0,
							}}
						>
							<Image
								src="/app-icons/codex.svg"
								alt="Codex"
								width={14}
								height={14}
							/>
							<span>codex</span>
							<LuX className="size-3.5 text-muted-foreground/20" />
						</motion.div>
						<motion.div
							className="flex items-center gap-1.5 overflow-hidden rounded-t-xs py-1.5 text-[11px] text-muted-foreground/38 hover:bg-white/[0.03]"
							initial={{
								opacity: 0,
								width: 0,
								paddingLeft: 0,
								paddingRight: 0,
							}}
							animate={{
								opacity: activeDemo === "Use Any Agents" ? 1 : 0,
								width: activeDemo === "Use Any Agents" ? "auto" : 0,
								paddingLeft: activeDemo === "Use Any Agents" ? 14 : 0,
								paddingRight: activeDemo === "Use Any Agents" ? 14 : 0,
							}}
							transition={{
								duration: 0.25,
								ease: "easeOut",
								delay: activeDemo === "Use Any Agents" ? 0.25 : 0,
							}}
						>
							<Image
								src="/app-icons/gemini.svg"
								alt="Gemini"
								width={14}
								height={14}
							/>
							<span>gemini</span>
							<LuX className="size-3.5 text-muted-foreground/20" />
						</motion.div>
						<motion.div
							className="flex items-center gap-1.5 overflow-hidden rounded-t-xs py-1.5 text-[11px] text-muted-foreground/38 hover:bg-white/[0.03]"
							initial={{
								opacity: 0,
								width: 0,
								paddingLeft: 0,
								paddingRight: 0,
							}}
							animate={{
								opacity: activeDemo === "Use Any Agents" ? 1 : 0,
								width: activeDemo === "Use Any Agents" ? "auto" : 0,
								paddingLeft: activeDemo === "Use Any Agents" ? 14 : 0,
								paddingRight: activeDemo === "Use Any Agents" ? 14 : 0,
							}}
							transition={{
								duration: 0.25,
								ease: "easeOut",
								delay: activeDemo === "Use Any Agents" ? 0.4 : 0,
							}}
						>
							<Image
								src="/app-icons/cursor-agent.svg"
								alt="Cursor"
								width={14}
								height={14}
							/>
							<span>cursor</span>
							<LuX className="size-3.5 text-muted-foreground/20" />
						</motion.div>
						<div className="flex cursor-pointer items-center px-2.5 py-1.5 text-muted-foreground/20 hover:text-muted-foreground/40">
							<LuPlus className="size-4" />
							<LuChevronDown className="size-3.5 ml-0.5" />
						</div>
					</div>

					{/* Terminal header */}
					<div className="flex items-center gap-2 border-b border-white/[0.04] bg-black/20 px-4 py-2.5">
						<span className="text-[10px] text-muted-foreground/40">⬛</span>
						<span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/38">
							Terminal
						</span>
						<div className="flex-1" />
						<span className="text-[10px] text-muted-foreground/20">□</span>
						<LuX className="size-3.5 text-muted-foreground/20" />
					</div>

					{/* Terminal content */}
					<div className="relative flex-1 overflow-hidden bg-black/30 p-5 font-mono text-[11px] leading-relaxed backdrop-blur-sm">
						{/* Default terminal content */}
						<motion.div
							className="flex h-full flex-col"
							initial={{ opacity: 1 }}
							animate={{
								opacity: activeDemo === "Create Parallel Branches" ? 0 : 1,
							}}
							transition={{ duration: 0.2, ease: "easeOut" }}
						>
							<div>
								{/* Claude ASCII art header */}
								<div className="mb-4 flex items-start gap-3.5">
									<div className="whitespace-pre text-[11px] leading-none text-[#D97757]/75">
										{`  * ▐▛███▜▌ *
 * ▝▜█████▛▘ *
  *  ▘▘ ▝▝  *`}
									</div>
									<div className="text-[11px] text-muted-foreground/90">
										<div>
											<span className="font-medium text-foreground">
												Claude Code
											</span>{" "}
											v2.0.74
										</div>
										<div>Opus 4.5 · Claude Max</div>
										<div className="text-muted-foreground/60">
											~/.superset/worktrees/superset/cloud-ws
										</div>
									</div>
								</div>

								{/* Command prompt */}
								<div className="mb-4 text-foreground">
									<span className="text-muted-foreground/60">❯</span>{" "}
									<span className="text-[#D97757]/80">/mcp</span>
								</div>

								{/* MCP output */}
								<div className="space-y-2.5 border-t border-white/[0.04] pt-4">
									<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/52">
										MCP Servers
									</div>
									<div className="text-[11px] text-muted-foreground/72">
										1 connected
									</div>

									<div className="mt-2">
										<span className="text-muted-foreground/50">❯</span>
										<span className="text-foreground ml-1">1.</span>
										<span className="ml-1 text-[#D97757]/75">superset-mcp</span>
										<span className="ml-2 text-emerald-300/75">
											✓ connected
										</span>
									</div>

									<div className="text-muted-foreground/60">
										config:{" "}
										<span className="text-muted-foreground/45">.mcp.json</span>
									</div>

									<div className="text-muted-foreground/60">
										tip: <span className="text-[#D97757]/65">/mcp disable</span>
									</div>
								</div>
							</div>

							<div className="mt-auto border-t border-white/[0.04] pt-4">
								<div className="flex items-center gap-3 rounded-xs border border-white/[0.07] bg-black/20 px-3 py-2.5">
									<span className="text-muted-foreground/50">❯</span>
									<span className="flex-1 text-[11px] text-muted-foreground/35">
										Type a task for Claude...
									</span>
									<div className="flex size-5 items-center justify-center rounded-full bg-[#D97757]/15 text-[11px] text-[#D97757]/80">
										↑
									</div>
								</div>
							</div>
						</motion.div>

						{/* Create Parallel Branches overlay */}
						<motion.div
							className="absolute inset-0 p-5 font-mono text-[11px] leading-relaxed"
							initial={{ opacity: 0 }}
							animate={{
								opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
							}}
							transition={{ duration: 0.3, ease: "easeOut" }}
							style={{
								pointerEvents:
									activeDemo === "Create Parallel Branches" ? "auto" : "none",
							}}
						>
							<div className="text-foreground mb-3">
								<span className="text-muted-foreground/60">❯</span>{" "}
								<span className="text-[#D97757]/80">superset new</span>
							</div>
							<div className="space-y-2 text-muted-foreground/70">
								<div className="flex items-center gap-2">
									<AsciiSpinner className="text-[11px]" />
									<span>Setting up new parallel environment...</span>
								</div>
								<div className="ml-5 text-muted-foreground/50">
									→ create worktree
								</div>
								<div className="ml-5 text-muted-foreground/50">
									→ install deps
								</div>
								<div className="ml-5 text-muted-foreground/50">
									→ ready shell
								</div>
							</div>
						</motion.div>
					</div>
				</div>

				{/* Right sidebar */}
				<motion.div
					className="bg-white/[0.02] backdrop-blur-lg border-l border-white/[0.06] flex flex-col shrink-0 relative overflow-hidden"
					initial={{ width: 230 }}
					animate={{
						width: activeDemo === "See Changes" ? 380 : 230,
					}}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					{/* Default view - Header, Commit & Push, File changes */}
					<motion.div
						className="absolute inset-0 flex flex-col"
						initial={{ opacity: 1 }}
						animate={{
							opacity: activeDemo === "See Changes" ? 0 : 1,
						}}
						transition={{ duration: 0.2, ease: "easeOut" }}
						style={{
							pointerEvents: activeDemo === "See Changes" ? "none" : "auto",
						}}
					>
						{/* Header */}
						<div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
							<span className="text-[10px] uppercase tracking-[0.14em] text-foreground/52">
								Review Changes
							</span>
							<div className="flex items-center gap-1 text-[11px]">
								<LuGitPullRequest className="size-4 text-[#D97757]/70" />
								<span className="text-muted-foreground/36">#827</span>
							</div>
						</div>

						{/* Commit & Push section */}
						<div className="space-y-2.5 border-b border-white/[0.06] px-4 py-3">
							<div className="flex h-9 items-center rounded-xs border border-white/[0.06] bg-black/20 px-3 text-[11px] text-muted-foreground/30">
								Commit message...
							</div>
							<button
								type="button"
								className="flex w-full items-center justify-center gap-2 rounded-xs border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-[11px] font-medium text-foreground/70 hover:bg-white/[0.07]"
							>
								<span>↑</span>
								<span>Push</span>
								<span className="text-[10px] text-muted-foreground/30">26</span>
							</button>
						</div>

						{/* File changes list */}
						<motion.div
							className="flex-1 overflow-hidden"
							initial={{ opacity: 1 }}
							animate={{
								opacity: activeDemo === "Create Parallel Branches" ? 0 : 1,
							}}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
							{FILE_CHANGES.map((file, i) => (
								<FileChangeItem
									key={`${file.path}-${i}`}
									path={file.path}
									add={file.add}
									del={file.del}
									indent={file.indent}
									type={file.type}
								/>
							))}
						</motion.div>
					</motion.div>

					{/* Diff review view - shown when "See Changes" is active */}
					<motion.div
						className="absolute inset-0 flex flex-col bg-black/30 backdrop-blur-md"
						initial={{ opacity: 0 }}
						animate={{
							opacity: activeDemo === "See Changes" ? 1 : 0,
						}}
						transition={{
							duration: 0.3,
							ease: "easeOut",
							delay: activeDemo === "See Changes" ? 0.1 : 0,
						}}
						style={{
							pointerEvents: activeDemo === "See Changes" ? "auto" : "none",
						}}
					>
						{/* PR Header */}
						<div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
							<div className="flex items-center gap-2">
								<LuGitPullRequest className="size-4.5 text-[#D97757]/75" />
								<span className="text-[13px] font-medium text-foreground/72">
									Review PR #827
								</span>
							</div>
							<span className="rounded-xs border border-[#D97757]/[0.10] bg-[#D97757]/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#D97757]/75">
								Open
							</span>
						</div>

						{/* File tabs */}
						<div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5 text-[11px]">
							<span className="rounded-xs border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 font-medium text-foreground/64">
								cloud-workspace.ts
							</span>
							<span className="px-3 py-1.5 text-muted-foreground/30">
								enums.ts
							</span>
							<span className="px-3 py-1.5 text-muted-foreground/30">
								+4 more
							</span>
						</div>

						{/* Diff content */}
						<div className="flex-1 overflow-hidden p-4 font-mono text-[11px]">
							<div className="space-y-1">
								<div className="text-muted-foreground/40 py-1">
									@@ -1,4 +1,6 @@
								</div>
								<div className="flex">
									<span className="w-7 text-muted-foreground/25 shrink-0">
										1
									</span>
									<span className="text-muted-foreground/60">
										import {"{"} db {"}"} from "../db"
									</span>
								</div>
								<div className="flex bg-emerald-300/[0.08]">
									<span className="w-7 shrink-0 text-emerald-300/75">+</span>
									<span className="text-emerald-300/75">
										import {"{"} CloudWorkspace {"}"} from "./types"
									</span>
								</div>
								<div className="flex bg-emerald-300/[0.08]">
									<span className="w-7 shrink-0 text-emerald-300/75">+</span>
									<span className="text-emerald-300/75">
										import {"{"} createSSHConnection {"}"} from "./ssh"
									</span>
								</div>
								<div className="flex">
									<span className="w-7 text-muted-foreground/25 shrink-0">
										2
									</span>
									<span className="text-muted-foreground/60"></span>
								</div>
								<div className="flex bg-rose-300/[0.08]">
									<span className="w-7 shrink-0 text-rose-300/75">-</span>
									<span className="text-rose-300/75">
										export const getWorkspaces = () ={">"} {"{"}
									</span>
								</div>
								<div className="flex bg-emerald-300/[0.08]">
									<span className="w-7 shrink-0 text-emerald-300/75">+</span>
									<span className="text-emerald-300/75">
										export const getWorkspaces = async () ={">"} {"{"}
									</span>
								</div>
								<div className="flex">
									<span className="w-7 text-muted-foreground/25 shrink-0">
										4
									</span>
									<span className="text-muted-foreground/60">
										{"  "}return db.query.workspaces
									</span>
								</div>
							</div>
						</div>

						{/* Review actions */}
						<div className="flex items-center gap-2.5 border-t border-white/[0.06] px-4 py-3">
							<button
								type="button"
								className="rounded-xs border border-emerald-300/[0.10] bg-emerald-300/[0.10] px-4 py-2 text-[11px] font-medium text-emerald-300/75 hover:bg-emerald-300/[0.16]"
							>
								Approve
							</button>
							<button
								type="button"
								className="rounded-xs border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-[11px] font-medium text-foreground/50 hover:bg-white/[0.07]"
							>
								Comment
							</button>
						</div>
					</motion.div>
				</motion.div>
			</div>

			{/* External IDE Popup - shown when "Open in Any IDE" is active */}
			<motion.div
				className="absolute bottom-6 right-6 w-[55%] rounded-xl overflow-hidden bg-black/50 backdrop-blur-xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)]"
				style={{ aspectRatio: "16/10" }}
				initial={{ opacity: 0, scale: 0.9, y: 20 }}
				animate={{
					opacity: activeDemo === "Open in Any IDE" ? 1 : 0,
					scale: activeDemo === "Open in Any IDE" ? 1 : 0.9,
					y: activeDemo === "Open in Any IDE" ? 0 : 20,
				}}
				transition={{ duration: 0.3, ease: "easeOut" }}
			>
				{/* Diagonal gradient glass border */}
				<div
					className="absolute inset-0 rounded-xl pointer-events-none z-10"
					style={{
						background:
							"linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 26%, rgba(255,255,255,0.03) 74%, rgba(255,255,255,0.07) 100%)",
						mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
						WebkitMask:
							"linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
						maskComposite: "exclude",
						WebkitMaskComposite: "xor",
						padding: "1.5px",
					}}
				/>
				{/* IDE window chrome */}
				<div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.04] px-4 py-2.5 backdrop-blur-md">
					<div className="flex items-center gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
					</div>
					<span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/38">
						External IDE
					</span>
					<div className="w-12" />
				</div>

				<div className="flex h-[calc(100%-36px)]">
					{/* File tree */}
					<div className="w-[110px] border-r border-white/[0.06] bg-white/[0.02] p-4 text-[11px]">
						<div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/36">
							<LuFolder className="size-4" />
							<span>src</span>
						</div>
						<div className="ml-4 space-y-2">
							<div className="flex items-center gap-2 font-medium text-[#D97757]/75">
								<LuFile className="size-4" />
								<span>index.ts</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground/30">
								<LuFile className="size-4" />
								<span>utils.ts</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground/30">
								<LuFile className="size-4" />
								<span>types.ts</span>
							</div>
						</div>
					</div>

					{/* Code editor */}
					<div className="flex-1 overflow-hidden bg-black/20 p-5 text-[11px] font-mono">
						<div className="space-y-2 leading-relaxed">
							<div>
								<span className="text-violet-300/60">import</span> {"{"} Agent{" "}
								{"}"} <span className="text-violet-300/60">from</span>{" "}
								<span className="text-stone-300/70">"ai"</span>
							</div>
							<div>
								<span className="text-violet-300/60">import</span> {"{"} tools{" "}
								{"}"} <span className="text-violet-300/60">from</span>{" "}
								<span className="text-stone-300/70">"./utils"</span>
							</div>
							<div className="text-muted-foreground/20">│</div>
							<div>
								<span className="text-violet-300/60">const</span>{" "}
								<span className="text-[#D97757]/75">agent</span> ={" "}
								<span className="text-stone-300/70">new</span> Agent({"{"}
							</div>
							<div className="pl-4">
								<span className="text-foreground/60">model:</span>{" "}
								<span className="text-stone-300/70">"claude-4"</span>,
							</div>
							<div className="pl-4">
								<span className="text-foreground/60">tools:</span> [tools.read,
								tools.write]
							</div>
							<div>{"}"})</div>
						</div>
					</div>
				</div>
			</motion.div>
		</div>
	);
}
