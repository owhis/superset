# V2 Project Create & Import — Type Contracts

Only the shapes that don't exist yet. Everything else is inferred from existing schemas / routers.

Companions:
- [`v2-project-create-import.md`](./v2-project-create-import.md) — flow design
- [`v2-host-project-paths.md`](./v2-host-project-paths.md) — path mapping mechanics

---

## Already exists — reuse, don't redeclare

| Need | Source |
|---|---|
| Cloud project row | `typeof v2Projects.$inferSelect` (`packages/db/src/schema/schema.ts:380`) |
| Cloud project + clone URL | `v2Projects.get` output (`packages/trpc/src/router/v2-project/v2-project.ts:82`) |
| Cloud project creation | `v2Projects.create` (ibid L113) — takes `{ name, slug, githubRepositoryId }` |
| Workspace (cloud) | `typeof v2Workspaces.$inferSelect` (has `projectId`, `hostId`) |
| Host (cloud) | `typeof v2Hosts.$inferSelect` (has `machineId`, `isOnline`) |
| Host-service project row | `typeof projects.$inferSelect` (`packages/host-service/src/db/schema.ts:32`) |
| Host-service workspace row | `typeof workspaces.$inferSelect` (ibid L95) |
| `project.setup` | `packages/host-service/src/trpc/router/project/project.ts:23` |
| Current host identity | `useLocalHostService().machineId` + `activeHostUrl` |
| Pinned-in-sidebar rows | `v2SidebarProjects` / `v2WorkspaceLocalState` (localStorage collections) |

---

## Backing is derived, not a new collection

No new Electric table, no new cloud endpoint for backing. The sidebar live-query combines two existing sources:

**A. Current host (authoritative, lag-free):** new host-service procedure, called via `activeHostClient` from `useLocalHostService`:

```ts
// packages/host-service/src/trpc/router/project/project.ts
project.list() → Array<{
  id: string              // matches v2_projects.id
  repoPath: string
  pathStatus: "healthy" | "missing"   // statSync(repoPath) at read time
}>
```

One row per `host-service.projects` entry on the calling machine. `pathStatus` is computed on read — keeps cell-3 detection server-side where `fs` lives.

**B. Remote online hosts (Electric-derived):** existing `v2_workspaces` + `v2_hosts` collections, already in `CollectionsProvider`. Live query:

```ts
q.from({ ws: v2Workspaces })
 .innerJoin({ h: v2Hosts }, eq(ws.hostId, h.id))
 .where(and(eq(h.isOnline, true), ne(h.machineId, currentMachineId)))
 .groupBy(ws.projectId)
// → Set<projectId> of remote-host-backed projects
```

Leans on the `ensureMainWorkspace` invariant (every backing has ≥1 workspace) so "remote host H has a workspace for project P" is equivalent to "H backs P."

---

## `HostBacking` view model (client-side composition)

Built by `useDashboardSidebarData` from the two sources + existing Electric collections. Not an RPC output — a typed shape used by components reading the hook.

```ts
type HostBacking = {
  host: SelectV2Host & { isCurrent: boolean }  // online-only; isCurrent via machineId compare
  repoPath: string | null                      // null for remote hosts (we don't know)
  status: "healthy" | "missing" | "unknown"    // healthy/missing from source A; unknown for remote
  workspaces: SelectV2Workspace[]              // from v2Workspaces filtered by hostId
}
```

Wrong-remote (cell 4) detection is out of Phase 1 — `project.setup` validates remote at entry and the state is rare.

---

## New endpoints

### Host-service `project.list` — backing source A

See above. Pure read, no input.

### Host-service `project.create` — orchestrator mutation

Calls cloud `v2Projects.create` (+ GitHub provisioning when we wire it), then local git, then inserts the host-service `projects` row, then creates the main workspace (enforces `ensureMainWorkspace`).

```ts
({
  name, visibility, localPath,
  mode:
    | { kind: "empty" }
    | { kind: "clone"; url: string }
    | { kind: "importLocal" }
    | { kind: "template"; templateId: string }
}) → { projectId: string; repoPath: string; mainWorkspaceId: string }
```

Phase 1: `clone` and `importLocal` (existing remote) implemented. Other modes throw `not_implemented`.

### Host-service `project.setup` — exists; additive fields

```ts
({
  projectId, mode: "import" | "clone", localPath,
  acknowledgeWorkspaceInvalidation?: boolean   // required when projects row already exists
}) → { repoPath: string; mainWorkspaceId: string }
```

Also creates the main workspace if none exists (upholds `ensureMainWorkspace`). `acknowledgeWorkspaceInvalidation` is how repair (cells 3/4) differs from first-time setup — no separate `project.repair` mutation.

---

## Sidebar live-query shape (target)

Extension of the current `useDashboardSidebarData` join, not a replacement. Existing joins stay verbatim:

```ts
// unchanged
pinnedProjects = v2SidebarProjects ⋈ v2Projects ⋈ githubRepositories
pinnedWorkspaces = v2WorkspaceLocalState ⋈ v2Workspaces ⋈ v2Hosts
```

Three new derivations filter the output:

```ts
localBacked:  Map<projectId, { repoPath: string; pathStatus: "healthy"|"missing" }>   // source A
remoteBacked: Map<projectId, Set<hostId>>                                              // source B
backedProjectIds: Set<projectId> = union of localBacked.keys() and remoteBacked.keys()

// filter
visibleProjects = pinnedProjects.filter(p => backedProjectIds.has(p.id))
availablePinned = pinnedProjects.filter(p => !backedProjectIds.has(p.id))  // to Available
```

Per-project `HostBacking[]` is composed from these maps plus `pinnedWorkspaces` grouped by `hostId`.

---

## Derived UI states

| Sidebar row | Condition |
|---|---|
| Normal | current-host backing is `status: "healthy"`, or only remote-host backings |
| Warning | current-host backing is `status: "missing"` (cell 3) |
| Demoted to Available | pinned but `backedProjectIds` does not contain it |

Workspace row host chip: `workspace.hostId` → match against `hostBackings[].host`, compare `host.machineId` with current to pick the chip variant.
