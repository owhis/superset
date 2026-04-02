import { describe, expect, test } from "bun:test";
import {
	getGitHubPRCommentsQueryPolicy,
	getGitHubStatusQueryPolicy,
} from "./githubQueryPolicy";

describe("getGitHubStatusQueryPolicy", () => {
	test("polls every 10s uniformly across all surfaces", () => {
		for (const surface of [
			"changes-sidebar",
			"workspace-page",
			"workspace-list-item",
			"workspace-hover-card",
			"workspace-row",
		] as const) {
			expect(
				getGitHubStatusQueryPolicy(surface, {
					hasWorkspaceId: true,
					isActive: true,
				}),
			).toEqual({
				enabled: true,
				refetchInterval: 10_000,
				refetchOnWindowFocus: true,
				staleTime: 10_000,
			});
		}
	});
});

describe("getGitHubPRCommentsQueryPolicy", () => {
	test("polls every 30s when active with a pull request", () => {
		expect(
			getGitHubPRCommentsQueryPolicy({
				hasWorkspaceId: true,
				hasActivePullRequest: true,
				isActive: true,
			}),
		).toEqual({
			enabled: true,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
			staleTime: 30_000,
		});
	});
});
