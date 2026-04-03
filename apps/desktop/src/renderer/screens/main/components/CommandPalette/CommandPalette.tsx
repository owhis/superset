import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import { SearchIcon } from "lucide-react";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";
import { useV2FileSearch } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2FileSearch";

// 48px input + 10 * 40px items
const MAX_DIALOG_HEIGHT = 448;
const SEARCH_LIMIT = 50;

export interface CommandPaletteProps {
	workspaceId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectFile: (filePath: string) => void;
	variant?: "v1" | "v2";
}

export function CommandPalette({
	workspaceId,
	open,
	onOpenChange,
	onSelectFile,
	variant = "v1",
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const v1Search = useFileSearch({
		workspaceId: variant === "v1" && open ? workspaceId : undefined,
		searchTerm: variant === "v1" ? query : "",
		limit: SEARCH_LIMIT,
	});

	const v2Search = useV2FileSearch(
		variant === "v2" && open ? workspaceId : undefined,
		variant === "v2" ? query : "",
	);

	const results = variant === "v2" ? v2Search.results : v1Search.searchResults;

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			onOpenChange(nextOpen);
			if (!nextOpen) setQuery("");
		},
		[onOpenChange],
	);

	const handleSelectFile = useCallback(
		(filePath: string) => {
			onSelectFile(filePath);
			handleOpenChange(false);
		},
		[onSelectFile, handleOpenChange],
	);

	useEffect(() => setSelectedIndex(0), [results]);
	useEffect(() => {
		if (open) requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);

	const scrollToIndex = useCallback((index: number) => {
		const el = listRef.current?.children[index] as HTMLElement | undefined;
		el?.scrollIntoView({ block: "nearest" });
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => {
					const next = Math.min(i + 1, results.length - 1);
					scrollToIndex(next);
					return next;
				});
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => {
					const next = Math.max(i - 1, 0);
					scrollToIndex(next);
					return next;
				});
			} else if (e.key === "Enter") {
				e.preventDefault();
				const item = results[selectedIndex];
				if (item) handleSelectFile(item.path);
			}
		},
		[results, selectedIndex, handleSelectFile, scrollToIndex],
	);

	return (
		<DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50" />
				<DialogPrimitive.Content
					className="bg-popover text-popover-foreground fixed left-[50%] z-50 w-full max-w-[672px] translate-x-[-50%] overflow-hidden rounded-lg border shadow-lg"
					style={{ top: `calc(50% - ${MAX_DIALOG_HEIGHT / 2}px)` }}
				>
					<DialogPrimitive.Title className="sr-only">
						Quick Open
					</DialogPrimitive.Title>
					<DialogPrimitive.Description className="sr-only">
						Search for files in your workspace
					</DialogPrimitive.Description>

					<div className="flex h-12 items-center gap-2 border-b px-3">
						<SearchIcon className="size-5 shrink-0 opacity-50" />
						<input
							ref={inputRef}
							placeholder="Search files..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						/>
					</div>

					<div
						ref={listRef}
						className="max-h-[400px] overflow-x-hidden overflow-y-auto scroll-py-1 p-1"
					>
						{results.length === 0 && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								No files found.
							</div>
						)}
						{results.map((file, index) => (
							<div
								key={file.id}
								data-selected={index === selectedIndex || undefined}
								className="data-[selected]:bg-accent data-[selected]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
								onClick={() => handleSelectFile(file.path)}
								onMouseMove={() => setSelectedIndex(index)}
							>
								<FileIcon fileName={file.name} className="size-3.5 shrink-0" />
								<span className="max-w-[252px] truncate font-medium">{file.name}</span>
								<span className="truncate text-muted-foreground text-xs">
									{file.relativePath}
								</span>
							</div>
						))}
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
