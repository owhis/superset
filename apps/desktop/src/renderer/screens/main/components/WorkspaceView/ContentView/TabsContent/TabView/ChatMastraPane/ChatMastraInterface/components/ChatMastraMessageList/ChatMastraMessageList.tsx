import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import {
	FileIcon,
	FileSearchIcon,
	FileTextIcon,
	ImageIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { useTabsStore } from "renderer/stores/tabs/store";
import { MastraToolCallBlock } from "../../../../ChatPane/ChatInterface/components/MastraToolCallBlock";
import { StreamingMessageText } from "../../../../ChatPane/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";
import { ReasoningBlock } from "../../../../ChatPane/ChatInterface/components/ReasoningBlock";
import type { ToolPart } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraActiveTools = NonNullable<UseMastraChatDisplayReturn["activeTools"]>;
type MastraToolInputBuffers = NonNullable<
	UseMastraChatDisplayReturn["toolInputBuffers"]
>;
type MastraMessageContent = MastraMessage["content"][number];
type MastraToolCall = Extract<MastraMessageContent, { type: "tool_call" }>;
type MastraToolResult = Extract<MastraMessageContent, { type: "tool_result" }>;
type MastraActiveTool =
	MastraActiveTools extends Map<string, infer ToolState> ? ToolState : never;
type MastraToolInputBuffer =
	MastraToolInputBuffers extends Map<string, infer InputBuffer>
		? InputBuffer
		: never;

interface ChatMastraMessageListProps {
	messages: MastraMessage[];
	isRunning: boolean;
	currentMessage: MastraMessage | null;
	workspaceId: string;
	workspaceCwd?: string;
	activeTools: MastraActiveTools | undefined;
	toolInputBuffers: MastraToolInputBuffers | undefined;
}

function ImagePart({ src, onClick }: { src: string; onClick?: () => void }) {
	return (
		<button type="button" className="cursor-zoom-in" onClick={onClick}>
			<img
				src={src}
				alt="Attached"
				className="max-h-48 rounded-lg object-contain"
			/>
		</button>
	);
}

function FileChip({
	filename,
	mediaType,
}: {
	filename?: string;
	mediaType: string;
}) {
	const icon = mediaType.startsWith("image/") ? (
		<ImageIcon className="size-3.5 shrink-0" />
	) : mediaType === "application/pdf" ? (
		<FileIcon className="size-3.5 shrink-0" />
	) : (
		<FileTextIcon className="size-3.5 shrink-0" />
	);
	return (
		<div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
			{icon}
			<span className="max-w-[150px] truncate">{filename || "Attachment"}</span>
		</div>
	);
}

function findToolResultForCall({
	content,
	toolCallId,
	startAt,
}: {
	content: MastraMessage["content"];
	toolCallId: string;
	startAt: number;
}): { result: MastraToolResult | null; index: number } {
	for (let index = startAt; index < content.length; index++) {
		const part = content[index];
		if (part.type === "tool_result" && part.id === toolCallId) {
			return { result: part, index };
		}
	}
	return { result: null, index: -1 };
}

function toToolPartFromCall({
	part,
	result,
	isStreaming,
}: {
	part: MastraToolCall;
	result: MastraToolResult | null;
	isStreaming: boolean;
}): ToolPart {
	return {
		type: `tool-${normalizeToolName(part.name)}` as ToolPart["type"],
		toolCallId: part.id,
		state: result?.isError
			? "output-error"
			: result
				? "output-available"
				: isStreaming
					? "input-streaming"
					: "input-available",
		input: part.args,
		...(result ? { output: result.result } : {}),
	} as ToolPart;
}

function toToolPartFromResult(part: MastraToolResult): ToolPart {
	return {
		type: `tool-${normalizeToolName(part.name)}` as ToolPart["type"],
		toolCallId: part.id,
		state: part.isError ? "output-error" : "output-available",
		input: {},
		output: part.result,
	} as ToolPart;
}

function toPreviewToolPart({
	toolCallId,
	toolState,
	inputBuffer,
}: {
	toolCallId: string;
	toolState: MastraActiveTool | null;
	inputBuffer: MastraToolInputBuffer | null;
}): ToolPart {
	const name =
		(toolState && "name" in toolState ? toolState.name : undefined) ??
		(inputBuffer && "toolName" in inputBuffer
			? inputBuffer.toolName
			: undefined) ??
		"unknown_tool";
	const status =
		toolState && "status" in toolState ? toolState.status : "streaming_input";
	const isError =
		toolState &&
		"isError" in toolState &&
		typeof toolState.isError === "boolean" &&
		toolState.isError;
	const state: ToolPart["state"] =
		status === "error" || isError
			? "output-error"
			: status === "completed"
				? "output-available"
				: status === "streaming_input"
					? "input-streaming"
					: "input-available";
	const input =
		(toolState && "args" in toolState ? toolState.args : undefined) ??
		(inputBuffer && "text" in inputBuffer ? inputBuffer.text : undefined) ??
		{};
	const output =
		(toolState && "result" in toolState ? toolState.result : undefined) ??
		(toolState && "partialResult" in toolState
			? toolState.partialResult
			: undefined);

	return {
		type: `tool-${normalizeToolName(name)}` as ToolPart["type"],
		toolCallId,
		state,
		input,
		...(state === "output-available" || state === "output-error"
			? { output }
			: {}),
	} as ToolPart;
}

function toToolEntries<T>(
	value: Map<string, T> | undefined,
): Array<[string, T]> {
	if (!value) return [];
	return [...value.entries()];
}

function findLastUserMessageIndex(messages: MastraMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

function getStreamingPreviewToolParts({
	activeTools,
	toolInputBuffers,
}: {
	activeTools: MastraActiveTools | undefined;
	toolInputBuffers: MastraToolInputBuffers | undefined;
}): ToolPart[] {
	const activeEntries = toToolEntries(activeTools);
	const inputEntries = toToolEntries(toolInputBuffers);
	const knownIds = new Set<string>([
		...activeEntries.map(([id]) => id),
		...inputEntries.map(([id]) => id),
	]);

	return [...knownIds].map((toolCallId) => {
		const toolState =
			activeEntries.find(([id]) => id === toolCallId)?.[1] ?? null;
		const inputBuffer =
			inputEntries.find(([id]) => id === toolCallId)?.[1] ?? null;
		return toPreviewToolPart({ toolCallId, toolState, inputBuffer });
	});
}

function UserMessage({
	message,
	workspaceId,
}: {
	message: MastraMessage;
	workspaceId: string;
}) {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	const handleImageClick = useCallback(
		(url: string) => {
			if (!workspaceId) return;
			addFileViewerPane(workspaceId, { filePath: url, isPinned: true });
		},
		[workspaceId, addFileViewerPane],
	);

	const images: Array<{ key: string; src: string }> = [];
	const fileChips: Array<{
		key: string;
		filename?: string;
		mediaType: string;
	}> = [];
	const textParts: Array<{ key: string; text: string }> = [];

	const parts = message.content as MastraMessageContent[];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const key = `${message.id}-${i}`;
		if (part.type === "text") {
			textParts.push({ key, text: part.text });
		} else if (part.type === "file") {
			if (part.mediaType.startsWith("image/")) {
				images.push({ key, src: part.data });
			} else {
				fileChips.push({
					key,
					filename: part.filename,
					mediaType: part.mediaType,
				});
			}
		}
	}

	return (
		<div
			className="flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{images.length > 0 && (
				<div className="flex max-w-[85%] flex-wrap gap-2">
					{images.map((img) => (
						<ImagePart
							key={img.key}
							src={img.src}
							onClick={() => handleImageClick(img.src)}
						/>
					))}
				</div>
			)}
			{fileChips.length > 0 && (
				<div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
					{fileChips.map((chip) => (
						<FileChip
							key={chip.key}
							filename={chip.filename}
							mediaType={chip.mediaType}
						/>
					))}
				</div>
			)}
			{textParts.map((tp) => (
				<div
					key={tp.key}
					className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap"
				>
					{tp.text}
				</div>
			))}
		</div>
	);
}

function AssistantMessage({
	message,
	isStreaming,
	workspaceId,
	workspaceCwd,
	previewToolParts = [],
}: {
	message: MastraMessage;
	isStreaming: boolean;
	workspaceId: string;
	workspaceCwd?: string;
	previewToolParts?: ToolPart[];
}) {
	const nodes: ReactNode[] = [];
	const renderedToolCallIds = new Set<string>();
	const parts = message.content as MastraMessageContent[];
	for (let partIndex = 0; partIndex < parts.length; partIndex++) {
		const part = parts[partIndex];

		if (part.type === "text") {
			nodes.push(
				<StreamingMessageText
					key={`${message.id}-${partIndex}`}
					text={part.text}
					isAnimating={isStreaming}
					mermaid={{
						config: {
							theme: "default",
						},
					}}
				/>,
			);
			continue;
		}

		if (part.type === "thinking") {
			nodes.push(
				<ReasoningBlock
					key={`${message.id}-${partIndex}`}
					reasoning={part.thinking}
				/>,
			);
			continue;
		}

		if (part.type === "file") {
			if (part.mediaType.startsWith("image/")) {
				nodes.push(
					<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
						<ImagePart src={part.data} />
					</div>,
				);
			} else {
				nodes.push(
					<FileChip
						key={`${message.id}-${partIndex}`}
						filename={part.filename}
						mediaType={part.mediaType}
					/>,
				);
			}
			continue;
		}

		if (part.type === "tool_call") {
			renderedToolCallIds.add(part.id);
			const { result, index: resultIndex } = findToolResultForCall({
				content: message.content,
				toolCallId: part.id,
				startAt: partIndex + 1,
			});

			nodes.push(
				<MastraToolCallBlock
					key={`${message.id}-tool-${part.id}`}
					part={toToolPartFromCall({
						part,
						result,
						isStreaming,
					})}
					workspaceId={workspaceId}
					workspaceCwd={workspaceCwd}
				/>,
			);

			// If next sibling is the matched result, skip it.
			if (resultIndex === partIndex + 1) {
				partIndex++;
			}
			continue;
		}

		if (part.type === "tool_result") {
			renderedToolCallIds.add(part.id);
			nodes.push(
				<MastraToolCallBlock
					key={`${message.id}-tool-result-${part.id}`}
					part={toToolPartFromResult(part)}
					workspaceId={workspaceId}
					workspaceCwd={workspaceCwd}
				/>,
			);
			continue;
		}

		if (part.type.startsWith("om_")) {
			nodes.push(
				<div
					key={`${message.id}-${partIndex}`}
					className="flex items-center gap-2 text-xs text-muted-foreground"
				>
					<FileSearchIcon className="size-3.5" />
					<span>{part.type.replaceAll("_", " ")}</span>
				</div>,
			);
		}
	}

	for (const previewPart of previewToolParts) {
		if (renderedToolCallIds.has(previewPart.toolCallId)) continue;
		nodes.push(
			<MastraToolCallBlock
				key={`${message.id}-tool-preview-${previewPart.toolCallId}`}
				part={previewPart}
				workspaceId={workspaceId}
				workspaceCwd={workspaceCwd}
			/>,
		);
	}

	return (
		<Message from="assistant">
			<MessageContent>
				{nodes.length === 0 && isStreaming ? (
					<ShimmerLabel className="text-sm text-muted-foreground">
						Thinking...
					</ShimmerLabel>
				) : (
					nodes
				)}
			</MessageContent>
		</Message>
	);
}

export function ChatMastraMessageList({
	messages,
	isRunning,
	currentMessage,
	workspaceId,
	workspaceCwd,
	activeTools,
	toolInputBuffers,
}: ChatMastraMessageListProps) {
	const visibleMessages = useMemo(() => {
		if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
			return messages;
		}
		const turnStartIndex = findLastUserMessageIndex(messages) + 1;
		const previousTurns = messages.slice(0, turnStartIndex);
		const activeTurnNonAssistant = messages
			.slice(turnStartIndex)
			.filter((message) => message.role !== "assistant");
		return [...previousTurns, ...activeTurnNonAssistant];
	}, [messages, isRunning, currentMessage]);

	const previewToolParts = useMemo(
		() =>
			getStreamingPreviewToolParts({
				activeTools,
				toolInputBuffers,
			}),
		[activeTools, toolInputBuffers],
	);

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-3xl gap-6 py-6 px-6">
				{visibleMessages.length === 0 ? (
					<ConversationEmptyState
						title="Start a conversation"
						description="Ask anything to get started"
						icon={<HiMiniChatBubbleLeftRight className="size-8" />}
					/>
				) : (
					visibleMessages.map((message) => {
						if (message.role === "user")
							return (
								<UserMessage
									key={message.id}
									message={message}
									workspaceId={workspaceId}
								/>
							);

						return (
							<AssistantMessage
								key={message.id}
								message={message}
								workspaceId={workspaceId}
								workspaceCwd={workspaceCwd}
								isStreaming={false}
								previewToolParts={[]}
							/>
						);
					})
				)}
				{isRunning && currentMessage && (
					<AssistantMessage
						key={`current-${currentMessage.id}`}
						message={currentMessage}
						workspaceId={workspaceId}
						workspaceCwd={workspaceCwd}
						isStreaming
						previewToolParts={previewToolParts}
					/>
				)}
				{isRunning &&
					!currentMessage &&
					visibleMessages[visibleMessages.length - 1]?.role === "user" &&
					previewToolParts.length === 0 && (
						<Message from="assistant">
							<MessageContent>
								<ShimmerLabel className="text-sm text-muted-foreground">
									Thinking...
								</ShimmerLabel>
							</MessageContent>
						</Message>
					)}
				{isRunning &&
					!currentMessage &&
					visibleMessages[visibleMessages.length - 1]?.role === "user" &&
					previewToolParts.length > 0 && (
						<Message from="assistant">
							<MessageContent>
								{previewToolParts.map((part) => (
									<MastraToolCallBlock
										key={`tool-preview-${part.toolCallId}`}
										part={part}
										workspaceId={workspaceId}
										workspaceCwd={workspaceCwd}
									/>
								))}
							</MessageContent>
						</Message>
					)}
			</ConversationContent>
			<ConversationScrollButton />
		</Conversation>
	);
}
