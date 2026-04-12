import { describe, expect, it } from "bun:test";
import {
	getVisibleMessages,
	resolvePendingPlanToolCallId,
} from "./messageListHelpers";

type TestMessage = {
	id: string;
	role: "user" | "assistant";
	content: Array<{ type: "text"; text: string }>;
	createdAt: Date;
	stopReason?: string;
};

function userMsg(id: string, text: string): TestMessage {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-03-07T00:00:00.000Z"),
	};
}

function assistantMsg(
	id: string,
	text: string,
	stopReason?: string,
): TestMessage {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-03-07T00:00:00.000Z"),
		...(stopReason !== undefined ? { stopReason } : {}),
	};
}

describe("getVisibleMessages", () => {
	it("drops active-turn assistant messages while streaming", () => {
		const result = getVisibleMessages({
			messages: [
				userMsg("u1", "hello"),
				assistantMsg("a_partial", "partial"),
			] as never,
			isRunning: true,
			currentMessage: assistantMsg("a_cur", "streaming") as never,
		});
		expect((result as TestMessage[]).map((m) => m.id)).toEqual(["u1"]);
	});

	it("preserves completed assistant when displayState races ahead", () => {
		const result = getVisibleMessages({
			messages: [
				userMsg("u1", "hello"),
				assistantMsg("a1", "done", "stop"),
			] as never,
			isRunning: true,
			currentMessage: assistantMsg("a_cur", "new turn") as never,
		});
		expect((result as TestMessage[]).map((m) => m.id)).toEqual(["u1", "a1"]);
	});

	it("returns messages unchanged when not running", () => {
		const result = getVisibleMessages({
			messages: [
				userMsg("u1", "hello"),
				assistantMsg("a1", "done", "stop"),
			] as never,
			isRunning: false,
			currentMessage: null,
		});
		expect((result as TestMessage[]).map((m) => m.id)).toEqual(["u1", "a1"]);
	});
});

describe("resolvePendingPlanToolCallId", () => {
	it("prefers explicit toolCallId when provided", () => {
		const result = resolvePendingPlanToolCallId({
			pendingPlanApproval: {
				toolCallId: "tool-call-explicit",
				planId: "plan-1",
			} as never,
			fallbackToolCallId: "tool-call-fallback",
		});

		expect(result).toBe("tool-call-explicit");
	});

	it("returns matching planId when it matches fallback", () => {
		const result = resolvePendingPlanToolCallId({
			pendingPlanApproval: {
				planId: "tool-call-fallback",
			} as never,
			fallbackToolCallId: "tool-call-fallback",
		});

		expect(result).toBe("tool-call-fallback");
	});

	it("falls back when no explicit id is available", () => {
		const result = resolvePendingPlanToolCallId({
			pendingPlanApproval: {
				title: "Approval required",
			} as never,
			fallbackToolCallId: "tool-call-fallback",
		});

		expect(result).toBe("tool-call-fallback");
	});
});
