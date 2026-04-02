const GITHUB_STATUS_STALE_TIME_MS = 10_000;
const GITHUB_STATUS_REFETCH_INTERVAL_MS = 10_000;
const GITHUB_PR_COMMENTS_STALE_TIME_MS = 30_000;
const GITHUB_PR_COMMENTS_REFETCH_INTERVAL_MS = 30_000;

export type GitHubStatusQuerySurface =
	| "changes-sidebar"
	| "workspace-page"
	| "workspace-hover-card"
	| "workspace-list-item"
	| "workspace-row";

export interface GitHubQueryPolicy {
	enabled: boolean;
	refetchInterval: number | false;
	refetchOnWindowFocus: boolean;
	staleTime: number;
}

interface GitHubStatusQueryPolicyOptions {
	hasWorkspaceId: boolean;
	isActive?: boolean;
}

interface GitHubPRCommentsQueryPolicyOptions {
	hasWorkspaceId: boolean;
	hasActivePullRequest: boolean;
	isActive?: boolean;
	isReviewTabActive?: boolean;
}

/**
 * Centralizes GitHub query behavior — all surfaces poll at 10s when active.
 */
export function getGitHubStatusQueryPolicy(
	surface: GitHubStatusQuerySurface,
	{ hasWorkspaceId, isActive = true }: GitHubStatusQueryPolicyOptions,
): GitHubQueryPolicy {
	const isEnabled = hasWorkspaceId && isActive;

	return {
		enabled: isEnabled,
		refetchInterval: isEnabled ? GITHUB_STATUS_REFETCH_INTERVAL_MS : false,
		refetchOnWindowFocus: isEnabled,
		staleTime: GITHUB_STATUS_STALE_TIME_MS,
	};
}

export function getGitHubPRCommentsQueryPolicy({
	hasWorkspaceId,
	hasActivePullRequest,
	isActive = true,
	isReviewTabActive = false,
}: GitHubPRCommentsQueryPolicyOptions): GitHubQueryPolicy {
	const isEnabled = hasWorkspaceId && isActive && hasActivePullRequest;

	return {
		enabled: isEnabled,
		refetchInterval:
			isEnabled && isReviewTabActive
				? GITHUB_PR_COMMENTS_REFETCH_INTERVAL_MS
				: false,
		refetchOnWindowFocus: isEnabled && isReviewTabActive,
		staleTime: GITHUB_PR_COMMENTS_STALE_TIME_MS,
	};
}
