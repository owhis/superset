import { describe, expect, test } from "bun:test";
import {
	getGitHubPRCommentsQueryPolicy,
	getGitHubStatusQueryPolicy,
} from "./githubQueryPolicy";

describe("getGitHubStatusQueryPolicy", () => {
	test("polls every 10s for any active surface", () => {
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

	test("disables polling when surface is inactive", () => {
		expect(
			getGitHubStatusQueryPolicy("changes-sidebar", {
				hasWorkspaceId: true,
				isActive: false,
			}),
		).toEqual({
			enabled: false,
			refetchInterval: false,
			refetchOnWindowFocus: false,
			staleTime: 10_000,
		});
	});

	test("disables polling when workspace id is missing", () => {
		expect(
			getGitHubStatusQueryPolicy("workspace-page", {
				hasWorkspaceId: false,
				isActive: true,
			}),
		).toEqual({
			enabled: false,
			refetchInterval: false,
			refetchOnWindowFocus: false,
			staleTime: 10_000,
		});
	});
});

describe("getGitHubPRCommentsQueryPolicy", () => {
	test("fetches review comments without polling when changes is open on diffs", () => {
		expect(
			getGitHubPRCommentsQueryPolicy({
				hasWorkspaceId: true,
				hasActivePullRequest: true,
				isActive: true,
				isReviewTabActive: false,
			}),
		).toEqual({
			enabled: true,
			refetchInterval: false,
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		});
	});

	test("polls review comments while the review tab is active", () => {
		expect(
			getGitHubPRCommentsQueryPolicy({
				hasWorkspaceId: true,
				hasActivePullRequest: true,
				isActive: true,
				isReviewTabActive: true,
			}),
		).toEqual({
			enabled: true,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
			staleTime: 30_000,
		});
	});

	test("disables comments when there is no active pull request", () => {
		expect(
			getGitHubPRCommentsQueryPolicy({
				hasWorkspaceId: true,
				hasActivePullRequest: false,
				isActive: true,
				isReviewTabActive: true,
			}),
		).toEqual({
			enabled: false,
			refetchInterval: false,
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		});
	});
});
