# V1 Create Workspace Port On V2 Hosts

This doc replaces the earlier split plan and API draft.

## Goal

Match the V1 create-workspace experience exactly while keeping the V2 stack:

1. V1 composer UX
2. V2 routes, collections, sidebar, and workspace rows
3. host-service as the semantic backend
4. `@superset/workspace-client` as the only host transport
5. the unified `/events` bus as the live-state channel

## Boundaries

### Renderer

Owns:

1. modal draft state
2. exact V1 UI
3. picking one `WorkspaceHostTarget`
4. optimistic UI and navigation

Does not own:

1. branch/worktree/open/adopt decisions
2. repo scanning
3. PR-specific create behavior
4. setup or agent execution
5. a separate websocket or polling layer

### `@superset/workspace-client`

Owns:

1. one tRPC client per host URL
2. one `/events` connection per host URL
3. auth, reconnect, ref-counting, subscriptions

Does not own:

1. create semantics
2. repo/worktree logic

### Host-service

Owns:

1. `workspaceCreation.*` APIs
2. repo clone/ensure
3. branch generation and base-branch handling
4. PR/issue/worktree resolution
5. open vs create vs adopt behavior
6. setup/init execution
7. agent launch handoff
8. lifecycle events on `/events`

### Cloud/shared APIs

Stay thin:

1. hosts
2. workspace rows
3. project metadata
4. shared PR/issue/task data if proxied by host-service

## Target UX

Keep the V1 surface:

1. single composer
2. workspace name
3. branch name
4. prompt
5. attachments
6. linked internal issues
7. linked GitHub issues
8. linked PR
9. agent picker
10. setup toggle
11. inline compare-base/worktree picker
12. auto-open/navigate after create

Do not keep the current V2 tabbed modal or visible host picker if they change the V1 experience.

## Target Host API

```ts
workspaceCreation.getContext({ projectId })
workspaceCreation.searchBranches({ projectId, query, filter, limit })
workspaceCreation.searchPullRequests({ projectId, query, limit })
workspaceCreation.searchInternalIssues({ projectId, query, limit })
workspaceCreation.searchGitHubIssues({ projectId, query, limit })
workspaceCreation.prepareAttachmentUpload(...)
workspaceCreation.commitAttachmentUpload(...)
workspaceCreation.create(...)

workspace.get({ id })
workspace.getInitState({ workspaceId })
workspace.gitStatus({ id })
workspace.delete({ id })
```

Core create shape:

```ts
workspaceCreation.create({
  projectId,
  source,
  names: { workspaceName, branchName },
  composer: { prompt, compareBaseBranch, runSetupScript },
  linkedContext: {
    internalIssueIds,
    githubIssueUrls,
    linkedPrUrl,
    attachments,
  },
  launch: { agentId, autoRun },
  behavior: { onExistingWorkspace, onExistingWorktree },
})
```

Create returns:

1. outcome: `created_workspace | opened_existing_workspace | opened_worktree | adopted_external_worktree`
2. workspace row
3. initial init state
4. warnings

## Event Bus

Use the existing host `/events` bus.

Keep:

1. `git:changed`
2. `fs:events`

Add:

```ts
workspace:init:changed { workspaceId, init }
```

Rules:

1. `workspaceCreation.create` returns the initial init snapshot
2. `workspace.getInitState` hydrates on reload
3. `/events` pushes later setup/agent progress
4. no separate create-status polling flow

## Phases

### Phase 1

1. Replace the V2 modal UI with the exact V1 composer
2. Expand the V2 draft/store to hold full V1 state
3. Add `workspaceCreation.getContext`
4. Add `workspaceCreation.searchBranches`
5. Add semantic `workspaceCreation.create`
6. Add `workspace.getInitState`
7. Add `workspace:init:changed`

### Phase 2

1. Move PR and issue linking behind host-service
2. Move attachments to upload refs
3. Port open/adopt worktree behavior fully
4. Remove remaining V2-only modal shell pieces

## Decisions Locked

1. Exact V1 UX wins over preserving the current V2 modal structure.
2. Host-service is the only semantic backend boundary for modal behavior.
3. `@superset/workspace-client` is the only host transport boundary.
4. Live init/setup state should extend the unified event bus.
5. Visible host selection is not part of first-pass parity.
