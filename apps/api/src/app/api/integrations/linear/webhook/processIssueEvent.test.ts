import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SelectIntegrationConnection } from "@superset/db/schema";

type TaskStatusRow = {
	id: string;
	organizationId: string;
	externalProvider: "linear";
	externalId: string;
};

let taskStatusRows: TaskStatusRow[] = [];

const insertValuesMock = mock(() => ({
	onConflictDoUpdate: async () => undefined,
}));
const insertMock = mock(() => ({ values: insertValuesMock }));
const updateMock = mock(() => ({
	set: () => ({ where: async () => undefined }),
}));

const findFirstMock = mock(async ({ where }: { where: unknown }) => {
	const w = where as { conditions: Array<{ right?: string }> };
	const externalId = w.conditions.find(
		(c) => (c as { left?: unknown }).left === "task_statuses.externalId",
	)?.right;
	return taskStatusRows.find((r) => r.externalId === externalId);
});

const selectLimitMock = mock(async () => []);
const selectWhereMock = mock(() => ({ limit: selectLimitMock }));
const selectInnerJoinMock = mock(() => ({ where: selectWhereMock }));
const selectFromMock = mock(() => ({ innerJoin: selectInnerJoinMock }));
const selectMock = mock(() => ({ from: selectFromMock }));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			taskStatuses: {
				findFirst: findFirstMock,
			},
		},
		insert: insertMock,
		update: updateMock,
		select: selectMock,
	},
}));

mock.module("@superset/db/schema", () => ({
	members: {
		organizationId: "members.organizationId",
		userId: "members.userId",
	},
	taskStatuses: {
		id: "task_statuses.id",
		organizationId: "task_statuses.organizationId",
		externalProvider: "task_statuses.externalProvider",
		externalId: "task_statuses.externalId",
	},
	tasks: {
		organizationId: "tasks.organizationId",
		externalProvider: "tasks.externalProvider",
		externalId: "tasks.externalId",
	},
	users: { id: "users.id", email: "users.email" },
}));

mock.module("@superset/trpc/integrations/linear", () => ({
	mapPriorityFromLinear: (value: number) => value,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

mock.module("../jobs/initial-sync/syncWorkflowStates", () => ({
	syncWorkflowStates: mock(async () => undefined),
}));

const { processIssueEvent } = await import("./processIssueEvent");

const ORGANIZATION_ID = "org-1";
const CONNECTED_USER_ID = "user-1";
const STATUS_ID = "status-1";
const EXTERNAL_STATE_ID = "state-1";

const connection: SelectIntegrationConnection = {
	id: "conn-1",
	organizationId: ORGANIZATION_ID,
	connectedByUserId: CONNECTED_USER_ID,
	provider: "linear",
	accessToken: "secret-token",
	refreshToken: null,
	tokenExpiresAt: null,
	externalOrgId: "linear-org-1",
	externalOrgName: "Linear Org",
	config: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

function buildPayload(action: "create" | "update") {
	return {
		type: "Issue",
		action,
		data: {
			id: "issue-1",
			identifier: "ENG-123",
			title: "Test issue",
			description: null,
			priority: 0,
			estimate: null,
			dueDate: null,
			createdAt: "2026-04-16T00:00:00.000Z",
			url: "https://linear.app/t/ENG-123",
			startedAt: null,
			completedAt: null,
			assignee: null,
			state: { id: EXTERNAL_STATE_ID, name: "New State", type: "started" },
			labels: [],
		},
	} as unknown as Parameters<typeof processIssueEvent>[0];
}

describe("processIssueEvent", () => {
	beforeEach(() => {
		taskStatusRows = [];
		insertMock.mockClear();
		insertValuesMock.mockClear();
		updateMock.mockClear();
		findFirstMock.mockClear();
	});

	test("inserts task when status already exists", async () => {
		taskStatusRows.push({
			id: STATUS_ID,
			organizationId: ORGANIZATION_ID,
			externalProvider: "linear",
			externalId: EXTERNAL_STATE_ID,
		});

		const syncCalls: unknown[] = [];
		const createCalls: string[] = [];

		const result = await processIssueEvent(buildPayload("create"), connection, {
			syncWorkflowStates: async (args) => {
				syncCalls.push(args);
			},
			createClient: (token) => {
				createCalls.push(token);
				return {} as never;
			},
		});

		expect(result).toBe("processed");
		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(syncCalls).toHaveLength(0);
		expect(createCalls).toHaveLength(0);
	});

	test("refreshes workflow states and retries when status is missing, then inserts the task", async () => {
		// Initially no rows. After syncWorkflowStates runs, the row appears.
		const syncCalls: unknown[] = [];

		const result = await processIssueEvent(buildPayload("create"), connection, {
			syncWorkflowStates: async (args) => {
				syncCalls.push(args);
				taskStatusRows.push({
					id: STATUS_ID,
					organizationId: ORGANIZATION_ID,
					externalProvider: "linear",
					externalId: EXTERNAL_STATE_ID,
				});
			},
			createClient: () => ({}) as never,
		});

		expect(result).toBe("processed");
		expect(syncCalls).toHaveLength(1);
		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(findFirstMock).toHaveBeenCalledTimes(2);
	});

	test("skips only when status is still missing after resync (defense in depth)", async () => {
		const syncCalls: unknown[] = [];

		const result = await processIssueEvent(buildPayload("update"), connection, {
			syncWorkflowStates: async (args) => {
				syncCalls.push(args);
				// Still no matching row, mimics a race or Linear omission.
			},
			createClient: () => ({}) as never,
		});

		expect(result).toBe("skipped");
		expect(syncCalls).toHaveLength(1);
		expect(insertMock).not.toHaveBeenCalled();
	});
});
