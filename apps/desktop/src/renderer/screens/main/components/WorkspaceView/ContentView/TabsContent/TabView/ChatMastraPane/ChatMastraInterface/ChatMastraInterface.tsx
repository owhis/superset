import { chatServiceTrpc } from "@superset/chat/client";
import {
	chatMastraServiceTrpc,
	useMastraChatDisplay,
} from "@superset/chat-mastra/client";
import {
	PromptInputAttachment,
	type PromptInputMessage,
	PromptInputProvider,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ChatInputFooter } from "../../ChatPane/ChatInterface/components/ChatInputFooter";
import { useSlashCommandExecutor } from "../../ChatPane/ChatInterface/hooks/useSlashCommandExecutor";
import type { SlashCommand } from "../../ChatPane/ChatInterface/hooks/useSlashCommands";
import type {
	ModelOption,
	PermissionMode,
} from "../../ChatPane/ChatInterface/types";
import { ChatMastraMessageList } from "./components/ChatMastraMessageList";
import { McpControls } from "./components/McpControls";
import { useMcpUi } from "./hooks/useMcpUi";
import { useOptimisticUpload } from "./hooks/useOptimisticUpload";
import type { ChatMastraInterfaceProps } from "./types";

function useAvailableModels(): {
	models: ModelOption[];
	defaultModel: ModelOption | null;
} {
	const { data } = useQuery({
		queryKey: ["chat", "models"],
		queryFn: () => apiTrpcClient.chat.getModels.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const models = data?.models ?? [];
	return { models, defaultModel: models[0] ?? null };
}

function toErrorMessage(error: unknown): string | null {
	if (!error) return null;
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	return "Unknown chat error";
}

type HarnessFilePayload = {
	data: string;
	mediaType: string;
	filename?: string;
};

function MastraUploadFooter({
	sessionId,
	onError,
	onSend,
	...footerProps
}: {
	sessionId: string | null;
	onError: (message: string) => void;
	onSend: (payload: { content: string; files?: HarnessFilePayload[] }) => void;
} & Omit<
	React.ComponentProps<typeof ChatInputFooter>,
	"onSend" | "submitDisabled" | "renderAttachment"
>) {
	const attachments = useProviderAttachments();
	const { getUploadedFiles, isUploading, entries } = useOptimisticUpload({
		sessionId,
		attachmentFiles: attachments.files,
		removeAttachment: attachments.remove,
		onError,
	});

	const handleSend = useCallback(
		(message: PromptInputMessage) => {
			const { ready, files: uploadedFiles } = getUploadedFiles();
			if (!ready) return;

			const files: HarnessFilePayload[] = uploadedFiles.map((file) => ({
				data: file.url,
				mediaType: file.mediaType,
				filename: file.filename,
			}));

			onSend({
				content: message.text,
				files: files.length > 0 ? files : undefined,
			});
		},
		[getUploadedFiles, onSend],
	);

	const renderAttachment = useCallback(
		(
			file: { id: string } & {
				url: string;
				mediaType: string;
				filename?: string;
				type: "file";
			},
		) => {
			const entry = entries.get(file.id);
			const loading = entry?.uploading ?? !entries.has(file.id);
			return <PromptInputAttachment data={file} loading={loading} />;
		},
		[entries],
	);

	return (
		<ChatInputFooter
			{...footerProps}
			submitDisabled={isUploading}
			renderAttachment={renderAttachment}
			onSend={handleSend}
		/>
	);
}

export function ChatMastraInterface({
	sessionId,
	workspaceId,
	cwd,
	onStartFreshSession,
	onRawSnapshotChange,
}: ChatMastraInterfaceProps) {
	const { models: availableModels, defaultModel } = useAvailableModels();
	const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
	const activeModel = selectedModel ?? defaultModel;
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>(
		undefined,
	);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const currentSessionRef = useRef<string | null>(null);
	const chatMastraServiceTrpcUtils = chatMastraServiceTrpc.useUtils();

	const { data: slashCommands = [] } =
		chatServiceTrpc.workspace.getSlashCommands.useQuery(
			{ cwd },
			{ enabled: Boolean(cwd) },
		);

	const chat = useMastraChatDisplay({
		sessionId,
		cwd,
		enabled: Boolean(sessionId),
		fps: 60,
	});
	const {
		commands,
		messages,
		currentMessage,
		isRunning = false,
		error = null,
		activeTools,
		toolInputBuffers,
	} = chat;

	const clearRuntimeError = useCallback(() => {
		setRuntimeError(null);
	}, []);

	const setRuntimeErrorMessage = useCallback((message: string) => {
		setRuntimeError(message);
	}, []);

	const canAbort = Boolean(isRunning);
	const loadMcpOverview = useCallback(
		async (rootCwd: string) => {
			if (!sessionId) {
				return { sourcePath: null, servers: [] };
			}

			return chatMastraServiceTrpcUtils.workspace.getMcpOverview.fetch({
				sessionId,
				cwd: rootCwd,
			});
		},
		[chatMastraServiceTrpcUtils.workspace.getMcpOverview, sessionId],
	);
	const mcpUi = useMcpUi({
		cwd,
		loadOverview: loadMcpOverview,
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
	});
	const resetMcpUi = mcpUi.resetUi;
	const refreshMcpOverview = mcpUi.refreshOverview;

	const { resolveSlashCommandInput } = useSlashCommandExecutor({
		cwd,
		availableModels,
		canAbort,
		onStartFreshSession,
		onStopActiveResponse: () => {
			void commands.stop();
		},
		onSelectModel: setSelectedModel,
		onOpenModelPicker: () => setModelSelectorOpen(true),
		onSetErrorMessage: setRuntimeErrorMessage,
		onClearError: clearRuntimeError,
		onShowMcpOverview: mcpUi.showOverview,
		loadMcpOverview,
	});

	useEffect(() => {
		if (currentSessionRef.current === sessionId) return;
		currentSessionRef.current = sessionId;
		setSubmitStatus(undefined);
		setRuntimeError(null);
		resetMcpUi();
		if (sessionId) {
			void refreshMcpOverview();
		}
	}, [refreshMcpOverview, resetMcpUi, sessionId]);

	useEffect(() => {
		if (isRunning) {
			setSubmitStatus((previousStatus) =>
				previousStatus === "submitted" || previousStatus === "streaming"
					? "streaming"
					: previousStatus,
			);
			return;
		}
		setSubmitStatus(undefined);
	}, [isRunning]);

	useEffect(() => {
		onRawSnapshotChange?.({
			sessionId,
			isRunning: canAbort,
			currentMessage: currentMessage ?? null,
			messages: messages ?? [],
			error,
		});
	}, [
		canAbort,
		currentMessage,
		error,
		messages,
		onRawSnapshotChange,
		sessionId,
	]);

	const handleSend = useCallback(
		async (payload: { content: string; files?: HarnessFilePayload[] }) => {
			let content = payload.content.trim();

			const slashCommandResult = await resolveSlashCommandInput(content);
			if (slashCommandResult.handled) {
				return;
			}
			content = slashCommandResult.nextText.trim();

			if (!content && (!payload.files || payload.files.length === 0)) return;
			setSubmitStatus("submitted");
			clearRuntimeError();

			await commands.sendMessage({
				payload: {
					content,
					...(payload.files?.length ? { files: payload.files } : {}),
				},
				metadata: {
					model: activeModel?.id,
				},
			});
		},
		[activeModel?.id, clearRuntimeError, commands, resolveSlashCommandInput],
	);

	const handleStop = useCallback(
		async (event: React.MouseEvent) => {
			event.preventDefault();
			clearRuntimeError();
			await commands.stop();
		},
		[clearRuntimeError, commands],
	);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			void handleSend({ content: `/${command.name}` });
		},
		[handleSend],
	);

	const errorMessage = runtimeError ?? toErrorMessage(error);
	const mergedMessages = useMemo(() => messages, [messages]);

	return (
		<div className="flex h-full flex-col bg-background">
			<ChatMastraMessageList
				messages={mergedMessages}
				isRunning={canAbort}
				currentMessage={currentMessage ?? null}
				workspaceId={workspaceId}
				workspaceCwd={cwd}
				activeTools={activeTools}
				toolInputBuffers={toolInputBuffers}
			/>
			<McpControls mcpUi={mcpUi} />
			<PromptInputProvider>
				<MastraUploadFooter
					sessionId={sessionId}
					onError={setRuntimeErrorMessage}
					onSend={(payload) => {
						void handleSend(payload);
					}}
					cwd={cwd}
					error={errorMessage}
					canAbort={canAbort}
					submitStatus={submitStatus}
					availableModels={availableModels}
					selectedModel={activeModel}
					setSelectedModel={setSelectedModel}
					modelSelectorOpen={modelSelectorOpen}
					setModelSelectorOpen={setModelSelectorOpen}
					permissionMode={permissionMode}
					setPermissionMode={setPermissionMode}
					thinkingEnabled={thinkingEnabled}
					setThinkingEnabled={setThinkingEnabled}
					slashCommands={slashCommands}
					onSubmitStart={() => setSubmitStatus("submitted")}
					onSubmitEnd={() => {
						if (!canAbort) setSubmitStatus(undefined);
					}}
					onStop={handleStop}
					onSlashCommandSend={handleSlashCommandSend}
				/>
			</PromptInputProvider>
		</div>
	);
}
