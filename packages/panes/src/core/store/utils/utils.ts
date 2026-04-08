import type {
	LayoutNode,
	SplitBranch,
	SplitDirection,
	SplitPath,
	SplitPosition,
} from "../../../types";

export function findPaneInLayout(node: LayoutNode, paneId: string): boolean {
	if (node.type === "pane") {
		return node.paneId === paneId;
	}
	return (
		findPaneInLayout(node.first, paneId) ||
		findPaneInLayout(node.second, paneId)
	);
}

export function findFirstPaneId(node: LayoutNode): string | null {
	if (node.type === "pane") {
		return node.paneId;
	}
	return findFirstPaneId(node.first) ?? findFirstPaneId(node.second);
}

export function findSiblingPaneId(
	node: LayoutNode,
	paneId: string,
): string | null {
	if (node.type === "pane") return null;

	const inFirst = findPaneInLayout(node.first, paneId);
	const inSecond = findPaneInLayout(node.second, paneId);

	if (inFirst && !inSecond) {
		// Target is in the first branch — sibling is the nearest pane in second
		const deeper = findSiblingPaneId(node.first, paneId);
		return deeper ?? findFirstPaneId(node.second);
	}
	if (inSecond && !inFirst) {
		const deeper = findSiblingPaneId(node.second, paneId);
		return deeper ?? findFirstPaneId(node.first);
	}

	return null;
}

export function removePaneFromLayout(
	node: LayoutNode,
	paneId: string,
): LayoutNode | null {
	if (node.type === "pane") {
		return node.paneId === paneId ? null : node;
	}

	const newFirst = removePaneFromLayout(node.first, paneId);
	const newSecond = removePaneFromLayout(node.second, paneId);

	// Both removed (shouldn't happen in practice)
	if (!newFirst && !newSecond) return null;
	// Sibling promotion — one child removed, promote the other
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	return { ...node, first: newFirst, second: newSecond };
}

export function replacePaneIdInLayout(
	node: LayoutNode,
	oldPaneId: string,
	newPaneId: string,
): LayoutNode {
	if (node.type === "pane") {
		return node.paneId === oldPaneId
			? { type: "pane", paneId: newPaneId }
			: node;
	}

	return {
		...node,
		first: replacePaneIdInLayout(node.first, oldPaneId, newPaneId),
		second: replacePaneIdInLayout(node.second, oldPaneId, newPaneId),
	};
}

export function splitPaneInLayout(
	node: LayoutNode,
	targetPaneId: string,
	newPaneId: string,
	position: SplitPosition,
): LayoutNode {
	if (node.type === "pane") {
		if (node.paneId !== targetPaneId) return node;

		const direction = positionToDirection(position);
		const newPaneNode: LayoutNode = { type: "pane", paneId: newPaneId };
		const isFirst = position === "left" || position === "top";

		return {
			type: "split",
			direction,
			first: isFirst ? newPaneNode : node,
			second: isFirst ? node : newPaneNode,
		};
	}

	return {
		...node,
		first: splitPaneInLayout(node.first, targetPaneId, newPaneId, position),
		second: splitPaneInLayout(node.second, targetPaneId, newPaneId, position),
	};
}

export function getNodeAtPath(
	node: LayoutNode,
	path: SplitPath,
): LayoutNode | null {
	if (path.length === 0) return node;
	if (node.type === "pane") return null;

	const [branch, ...rest] = path as [SplitBranch, ...SplitBranch[]];
	return getNodeAtPath(node[branch], rest);
}

export function updateAtPath(
	node: LayoutNode,
	path: SplitPath,
	updater: (node: LayoutNode) => LayoutNode,
): LayoutNode {
	if (path.length === 0) return updater(node);
	if (node.type === "pane") return node;

	const [branch, ...rest] = path as [SplitBranch, ...SplitBranch[]];
	return {
		...node,
		[branch]: updateAtPath(node[branch], rest, updater),
	};
}

export function getOtherBranch(branch: SplitBranch): SplitBranch {
	return branch === "first" ? "second" : "first";
}

function countLeaves(node: LayoutNode): number {
	if (node.type === "pane") return 1;
	return countLeaves(node.first) + countLeaves(node.second);
}

export function equalizeAllSplits(node: LayoutNode): LayoutNode {
	if (node.type === "pane") return node;

	const firstLeaves = countLeaves(node.first);
	const secondLeaves = countLeaves(node.second);

	return {
		...node,
		splitPercentage: (firstLeaves / (firstLeaves + secondLeaves)) * 100,
		first: equalizeAllSplits(node.first),
		second: equalizeAllSplits(node.second),
	};
}

export function positionToDirection(position: SplitPosition): SplitDirection {
	return position === "left" || position === "right"
		? "horizontal"
		: "vertical";
}

/**
 * Find the pane in a given direction relative to the current pane.
 *
 * Walks up the layout tree from `currentPaneId` to find the nearest ancestor
 * split whose direction matches the requested movement axis. Then crosses to
 * the other branch and picks the closest pane on that side, preserving the
 * pane's cross-axis position when possible.
 *
 * Returns `null` if no pane exists in the requested direction.
 */
export function findPaneInDirection(
	root: LayoutNode,
	currentPaneId: string,
	direction: "up" | "down" | "left" | "right",
): string | null {
	const path = findPathToPane(root, currentPaneId);
	if (!path) return null;

	const axis: SplitDirection =
		direction === "left" || direction === "right" ? "horizontal" : "vertical";
	const targetBranch: SplitBranch =
		direction === "right" || direction === "down" ? "second" : "first";

	// Walk up the path to find the nearest ancestor split on the correct axis
	// where the current pane is on the opposite side of where we want to go
	for (let i = path.length - 1; i >= 0; i--) {
		const { node, branch } = path[i];
		if (node.type !== "split") continue;
		if (node.direction !== axis) continue;
		if (branch === targetBranch) continue;

		// Collect cross-axis branches below step i to preserve position
		const crossAxisHint: SplitBranch[] = [];
		for (let j = i + 1; j < path.length; j++) {
			const step = path[j];
			if (step.node.type === "split" && step.node.direction !== axis) {
				crossAxisHint.push(step.branch);
			}
		}

		const entryEdge: "first" | "last" =
			direction === "right" || direction === "down" ? "first" : "last";
		return findNeighborPane(node[targetBranch], axis, entryEdge, crossAxisHint);
	}

	return null;
}

/** A step in the path from root to a pane: the split node and which branch was taken. */
interface PathStep {
	node: LayoutNode;
	branch: SplitBranch;
}

/** Returns the path of split nodes from root to the pane, or null if not found. */
function findPathToPane(node: LayoutNode, paneId: string): PathStep[] | null {
	if (node.type === "pane") {
		return node.paneId === paneId ? [] : null;
	}

	const inFirst = findPathToPane(node.first, paneId);
	if (inFirst !== null) {
		return [{ node, branch: "first" }, ...inFirst];
	}

	const inSecond = findPathToPane(node.second, paneId);
	if (inSecond !== null) {
		return [{ node, branch: "second" }, ...inSecond];
	}

	return null;
}

/**
 * Find the best pane in a neighbor subtree, preserving cross-axis position.
 *
 * For same-axis splits, picks the near edge (`entryEdge`).
 * For cross-axis splits, follows `crossAxisHint` to maintain alignment
 * with the source pane's position. Falls back to "first" when hints run out.
 */
function findNeighborPane(
	node: LayoutNode,
	axis: SplitDirection,
	entryEdge: "first" | "last",
	crossAxisHint: SplitBranch[],
): string | null {
	if (node.type === "pane") return node.paneId;

	if (node.direction === axis) {
		const branch = entryEdge === "first" ? "first" : "second";
		return findNeighborPane(node[branch], axis, entryEdge, crossAxisHint);
	}

	// Cross-axis split: use hint if available, otherwise default to "first"
	const [hint, ...remainingHints] = crossAxisHint;
	const branch = hint ?? "first";
	return findNeighborPane(node[branch], axis, entryEdge, remainingHints);
}

export function generateId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}
