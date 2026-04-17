# V2 Project Create & Import Flow

Design for the v2 "create project" and "import project" flows. V2 projects are cloud-driven, and materialization is per-host. Companion: [`v2-host-project-paths.md`](./v2-host-project-paths.md) (path mapping + throw-on-create mechanics).

---

## Source of truth for "backed on this host"

A project is **backed** on a given host iff there is a row in that host's `host-service.projects` table (`packages/host-service/src/db/schema.ts:32`):

```ts
projects {
  id text PK               // matches cloud v2_projects.id
  repoPath text NOT NULL   // local main repo path
  repoProvider, repoOwner, repoName, repoUrl, remoteName
  createdAt
}
```

`workspaces.projectId` FKs to this. No project row → no workspaces possible on that host.

The row's `repoPath` can be stale on disk (cell 3) — a broken-but-backed state, handled with a repair CTA, not hidden. Wrong-remote drift (cell 4) is logged in the matrix for completeness but not surfaced or repaired in Phase 1 — entry validation by `project.setup` prevents it at setup time, and the state is rare in practice.

---

## Current sidebar reality (and what's broken)

The existing v2 sidebar (`apps/desktop/…/useDashboardSidebarData.ts`) is **pin-driven**, not backing-driven. Visibility is controlled entirely by per-device localStorage collections:

| Collection | Storage | Role |
|---|---|---|
| `v2SidebarProjects` | localStorage | Project is in sidebar iff row exists. Holds `projectId`, `tabOrder`, `isCollapsed`, `defaultOpenInApp`. |
| `v2WorkspaceLocalState` | localStorage | Workspace is in sidebar iff row exists. Holds `sidebarState.projectId/tabOrder/sectionId` + pane/view UX state. |
| `v2SidebarSections` | localStorage | Optional grouping rows inside a project. |
| `pendingWorkspaces` | localStorage | Pending workspace creation rows, injected into the tree. |

The live-query joins are:

```ts
// projects
v2SidebarProjects ⋈ v2Projects (electric) ⋈ githubRepositories (electric)

// workspaces
v2WorkspaceLocalState ⋈ v2Workspaces (electric) ⋈ v2Hosts (electric)
```

`hostType` per workspace is derived client-side: `v2Hosts.machineId === useLocalHostService().machineId` → `"local-device" | "remote-device"`, `null` → `"cloud"`. Pull-request data is fetched separately via the local host-service tRPC for `local-device` workspaces only.

**Nothing in this graph consults `host-service.projects`.** A project can be pinned with no backing anywhere → it still renders, and "New workspace" throws deep in the creation flow. That's the gap the design fills.

---

## State dimensions

Per host, a project has three independent signals:

| Axis | Values |
|---|---|
| `host-service.projects` row | exists / missing |
| `repoPath` on disk | valid git root / missing / not-a-repo |
| Remote match vs cloud `repoCloneUrl` | match / mismatch |

Plus the global axis: **cloud `v2_projects` row** (exists / doesn't).

### Meaningful cells (per host × cloud)

| # | Cloud | Host row | Disk | Remote | Meaning | Action |
|---|:-:|:-:|---|---|---|---|
| 1 | ✓ | ✗ | — | — | Cloud-only (new teammate, other device) | Setup (`project.setup` clone or import) |
| 2 | ✓ | ✓ | valid | match | Fully backed | — |
| 3 | ✓ | ✓ | missing | — | Stale path | Repair |
| 4 | ✓ | ✓ | valid | mismatch | Wrong remote (deferred — not surfaced in Phase 1) | — |
| 5 | ✗ | — | — | — | Brand new | `project.create` |

Across N connected hosts the sidebar state = union of per-host cells.

---

## Host-service is the orchestrator

Every client calls host-service. Desktop today; web/mobile will reach host-service later (remote RPC is future infra). The host-service RPC **is the create flow** — it owns cloud-row creation, optional GitHub repo provisioning, local git ops, and local DB insert in one transaction.

### `project.create` (new)

```ts
project.create({
  name, visibility,
  localPath,   // parent dir for clone/empty/template; git root for importLocal
  mode:
    | { kind: "empty" }
    | { kind: "clone", url: string }
    | { kind: "importLocal" }              // existing local repo, we provision the remote
    | { kind: "template", templateId: string }
})
→ { projectId, repoPath }
```

Internal order:
1. Cloud API: create `v2_projects` row (+ GitHub repo for empty/importLocal/template)
2. Local git: clone / init+push / link+push / scaffold+push
3. Upsert `host-service.projects` row with `repoPath` + remote metadata
4. Return

**GitHub repo creation is in scope.** Otherwise `empty` and `template` degrade to `clone` and we lose half the UX.

**Always materializes on the calling host.** No "cloud-only" mode. No "create on behalf of another host" — other hosts use `project.setup` when they need it.

**Rollback on mid-flow failure: none.** If cloud row is created but local clone fails, the cloud row stays. The project is now in cell 1 on this host. User retries via `project.setup` — the same flow every second-host already uses. Cell 1 is a first-class state, not a failure mode.

### `project.setup` (exists — `packages/host-service/src/trpc/router/project/project.ts:23`)

```ts
project.setup({ projectId, mode: "import" | "clone", localPath })
→ { repoPath }
```

Drives cell 1 → cell 2 and repairs cell 3 (upsert). Already wired for git-remote validation, which also prevents entering cell 4 at setup time.

### Client responsibilities

Native pickers (`dialog.showOpenDialog` on desktop, file pickers on other clients) stay in the client — host-service has no UI. Client collects the path, passes it into `project.create` / `project.setup`.

---

## UI surfaces

Two surfaces, sharp separation. Both are driven by one derived signal: **"is this project backed on a currently-connected host?"**

### Backing derivation (two sources, combined client-side)

Nothing new gets synced. Backing is computed from what's already on the device:

| Source | Authority | Query path |
|---|---|---|
| **A. Current host** | local host-service SQLite `projects` table | new procedure `project.list() → { id }[]` on host-service, called via `useLocalHostService`'s `activeHostClient` |
| **B. Remote online hosts** | Electric `v2_workspaces ⋈ v2_hosts` where `v2_hosts.isOnline = true` and `v2_hosts.machineId !== currentMachineId` | existing live query — derive "host H backs project P" iff `∃ workspace(projectId = P, hostId = H)` |

Source B leans on a load-bearing invariant: **every backing has ≥1 workspace** (ported from v1's `ensureMainWorkspace`). `project.create` and `project.setup` must create a main workspace; workspace-deletion must not drop below one as long as the backing exists. Without this, a freshly-backed remote host with no workspaces yet would read as unbacked.

Source A is authoritative and lag-free for the current host (calls a local daemon). Source B tolerates Electric sync lag for remote hosts — acceptable because the user can't act on a remote host's backing directly anyway.

Combined result per project: `HostBacking[]` (see [types doc](./v2-project-create-import-types.md)). Length ≥ 1 ⇒ project qualifies as "backed somewhere I can reach."

### Active (sidebar)

**Visibility rule: `v2SidebarProjects` row AND ≥1 `HostBacking` from source A or B.**

Pin (per-device localStorage) still controls "I want to see this" — that's the user preference layer and it shouldn't be yanked away. Backing filters out pins whose project has no operational path from any connected host. An unbacked pin is demoted to Available (with its pin preserved) until a backing reappears.

Everything else about the current join stays — we extend `useDashboardSidebarData`, not replace it:

```ts
// add two inputs to the hook
const currentHostBackedIds = useQuery(activeHostClient.project.list)  // source A, Set<projectId>
const remoteBackedByProject = useLiveQuery(q => q
  .from({ ws: collections.v2Workspaces })
  .innerJoin({ h: collections.v2Hosts }, ({ ws, h }) => eq(ws.hostId, h.id))
  .where(({ h }) => and(eq(h.isOnline, true), ne(h.machineId, machineId)))
  .groupBy(({ ws }) => ws.projectId)
)  // source B

// filter sidebarProjects before rendering
const backedProjectIds = new Set([
  ...currentHostBackedIds,
  ...remoteBackedByProject.map(r => r.projectId),
])
sidebarProjects.filter(p => backedProjectIds.has(p.id))
```

Workspace row layout stays. Additions per row:

- **Host chip per workspace row** — current-host vs remote-device vs cloud, using the existing `hostType` derivation
- **Per-project row state:**
  - Normal — current-host backing healthy, or only remote-host backings
  - Warning dot — current host has a backing but it's cell 3 (stale path). Surfaced by `project.list` returning path-status per row, or a second `project.listWithStatus` variant.
- **"New workspace" action inside a project:** if current host backs it → creates directly. If only remote hosts back it → inline setup-then-create on current host (the throw-based flow in the companion doc).

"Filter by this machine" toggle is deferred; add when cross-machine workspace volume makes it useful.

### Available (discover / import)

Lists the union of:

1. Cloud projects with no backing on any connected host (derived: `v2_projects \ backedProjectIds`).
2. Projects the user has pinned (`v2SidebarProjects`) whose backing has disappeared — so they don't lose their place.

Each row action:

- **"Set up here"** → `project.setup` (clone or import)
- Also hosts the **"+ New project"** entry point → `project.create`

Once set up, the project migrates back to Active on next tick (the backing source flips).

### Repair

Cells 3 and 4 live in Active with a warning dot on the project row. Clicking the warning opens the same UI as "Set up here" with the existing `host-service.projects` row as the upsert target (`acknowledgeWorkspaceInvalidation: true` — see types doc). Path re-pointing invalidates existing workspace rows under the project; user confirms before the upsert.

---

## Flow summary

| Transition | RPC | Entry point | Backing source that flips |
|---|---|---|---|
| nothing → cell 2 | `project.create` | Available list "+ New project", sidebar global "+" | A (local) immediately; B (remote) on Electric sync of the new workspace row |
| cell 1 → cell 2 | `project.setup` | Available list "Set up here" | A immediately |
| cell 3 → cell 2 | `project.setup` (upsert, `acknowledgeWorkspaceInvalidation: true`) | Warning dot in Active | A immediately |
| first-workspace-on-new-host | workspace.create throw → `project.setup` inline → retry | New Workspace modal | A immediately |

---

## User journeys

Moved to [`v2-project-user-journeys.md`](./v2-project-user-journeys.md) — traces five scenarios (new user, joining an existing org, adding a second host, multi-host workflow, offline host) against the state matrix + backing sources above.

---

## Open questions

1. **Disambiguation on import.** If a user points at a folder whose remote matches multiple cloud projects (forks), `project.setup` takes `projectId` — so the caller must already have picked. A "browse a folder → which project?" entry point needs a picker. Skip unless a concrete entry point needs it.

2. **GitHub auth for repo creation.** Where does host-service get the token? Likely cloud-side (GitHub App installation), fetched via `ctx.api`. Org-picker UX is a separate design.

3. **Template source.** Where do templates live — cloud records, curated registry, user-provided? Separate design; the mode exists in the RPC shape but implementation can be stubbed until decided.

4. **Mid-flow failure visibility.** With no rollback, a cloud row can exist without any host-service row anywhere. The Available list surfaces this naturally, but we should decide whether the originating client shows an inline "setup unfinished" recovery path or just routes through Available.

5. **Auto-pin on `project.create` / `project.setup`.** Journey 1/2 assumes the act of creating or setting up a project implies "I want this in my sidebar." Confirm — alternative is explicit pin action post-setup, which is extra friction.

6. **Cross-device pin sync (journey 3).** Strict default = `v2SidebarProjects` stays local; second host starts with empty sidebar and opts in via Available. Permissive = promote sidebar pins to cloud so pins follow the user across hosts. Strict is the cheap default; revisit when pain shows up.

---

## Phasing

1. **Phase 1** — `project.create` in host-service (clone + importLocal first; empty/template throw `not_implemented`). Client UI wrapper driving it. Available list with "+ New project" and "Set up here" actions. New host-service `project.list` endpoint. Backing-filter wired into `useDashboardSidebarData` with the two-source derivation above.
2. **Phase 2** — Sidebar polish: host chips on workspace rows, backed-pin-but-no-sync edge cases, `ensureMainWorkspace` invariant enforcement in `project.create`/`project.setup`.
3. **Phase 3** — Workspace-create throw integration (from companion doc). Inline setup-then-create.
4. **Phase 4** — Repair flow for cell 3 (warning dot → repair UI, workspace-invalidation confirmation via `acknowledgeWorkspaceInvalidation`).
