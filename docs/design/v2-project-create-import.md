# V2 Project Create & Import

Design for the v2 "create project" and "import project" flows. V2 projects are cloud-driven, and materialization is per-host. Companion: `v2-host-project-paths.md` — path mapping + throw-on-create mechanics for workspaces.

---

## Backing: source of truth

A project is **backed on a host** iff that host's `host-service.projects` table has a row for it (`packages/host-service/src/db/schema.ts:32`):

```ts
projects {
  id text PK               // matches cloud v2_projects.id
  repoPath text NOT NULL   // local main repo path
  repoProvider, repoOwner, repoName, repoUrl, remoteName
  createdAt
}
```

`workspaces.projectId` FKs to this. No project row → no workspaces possible on that host. `repoPath` can be stale on disk (cell 3) — handled with a repair CTA.

---

## State dimensions

Per host, a project has three signals; plus the global cloud signal:

| Axis | Values |
| --- | --- |
| Cloud `v2_projects` row | exists / missing |
| Host's `host-service.projects` row | exists / missing |
| `repoPath` on disk | valid git root / missing |

### Cells

| \# | Cloud | Host row | Disk | Meaning | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | ✓ | ✗ | — | Cloud-only (teammate, other device) | `project.setup` (clone/import) |
| 2 | ✓ | ✓ | valid | Fully backed | — |
| 3 | ✓ | ✓ | missing | Stale path | Repair via `project.setup` |
| 5 | ✗ | — | — | Brand new | `project.create` |

Wrong-remote drift (host row exists but its remote doesn't match cloud's `repoCloneUrl`) is prevented at entry by `project.setup`'s remote validation. Not modelled here.

---

## Current sidebar (and what's broken)

The existing v2 sidebar (`useDashboardSidebarData`) is **pin-driven**, not backing-aware. Visibility comes from three per-device localStorage collections:

| Collection | Role |
| --- | --- |
| `v2SidebarProjects` | Project is in sidebar iff row exists. Holds `projectId`, `tabOrder`, `isCollapsed`. |
| `v2WorkspaceLocalState` | Workspace is in sidebar if row exists. Holds `sidebarState.projectId/tabOrder/sectionId`. |
| `v2SidebarSections` | Optional grouping rows. |

Nothing in the join consults `host-service.projects`. Pinned projects with no backing still render, and "New workspace" throws deep in the creation flow. This design fills that gap.

---

## Host-service as orchestrator

Every client calls host-service. Desktop today; web/mobile route through host-service later. The host-service RPC **is the create flow** — cloud-row creation, optional GitHub repo provisioning, local git, local DB insert, main-workspace seed.

### `project.create` (new)

```ts
project.create({
  name: string,
  visibility: "private" | "public",
  localPath: string,    // parent dir for clone/empty/template; git root for importLocal
  mode:
    | { kind: "empty" }
    | { kind: "clone"; url: string }
    | { kind: "importLocal" }            // existing local repo, we provision the remote
    | { kind: "template"; templateId: string }
}) → { projectId: string; repoPath: string; mainWorkspaceId: string }
```

Internal order:

1. Cloud: create `v2_projects` row (+ GitHub repo for empty/importLocal/template)
2. Local git: clone / init+push / link+push / scaffold+push
3. Upsert `host-service.projects` row with `repoPath` + remote metadata
4. Create main workspace (upholds `ensureMainWorkspace` invariant)
5. Return

**GitHub repo creation is in scope** — otherwise `empty` and `template` degrade to `clone`.

**Always materializes on the calling host.** No "cloud-only" mode. Other hosts use `project.setup`.

**No rollback on mid-flow failure.** Cloud row created but local clone fails → project is in cell 1. User retries via `project.setup`. Cell 1 is a first-class state, not a failure mode.

Phase 1 ships `clone` and `importLocal` only; `empty` and `template` throw `not_implemented`.

### `project.setup` (exists — `packages/host-service/src/trpc/router/project/project.ts:23`)

Drives cell 1 → 2 and repairs cell 3. Already wired for git-remote validation.

```ts
project.setup({
  projectId: string,
  mode: "import" | "clone",
  localPath: string,
  acknowledgeWorkspaceInvalidation?: boolean   // required when projects row already exists
}) → { repoPath: string; mainWorkspaceId: string }
```

Changes:

- Creates main workspace if none exists (upholds `ensureMainWorkspace`).
- `acknowledgeWorkspaceInvalidation` is the repair-vs-first-time discriminator. Path re-point invalidates existing workspace rows; caller must ack.

### `project.list` (new)

```ts
project.list() → Array<{
  id: string              // matches v2_projects.id
  repoPath: string
  pathStatus: "healthy" | "missing"   // statSync(repoPath) at read time
}>
```

One row per `host-service.projects` entry on the calling machine. Cell-3 detection stays server-side where `fs` lives.

Renderer refetches after `project.create` / `project.setup` / `project.remove` mutations via React Query invalidation on the shared `["project", "list"]` key. No subscription — backing rarely changes and invalidation-on-mutation is sufficient.

### Client responsibilities

Native pickers (`dialog.showOpenDialog`) stay in the client — host-service has no UI. Client collects the path, passes it into `project.create` / `project.setup`.

---

## Existing types — reuse, don't redeclare

| Need | Source |
| --- | --- |
| Cloud project row | `typeof v2Projects.$inferSelect` (`packages/db/src/schema/schema.ts:380`) |
| Cloud project + clone URL | `v2Projects.get` output (`packages/trpc/src/router/v2-project/v2-project.ts:82`) |
| Cloud project creation | `v2Projects.create` (L113) — takes `{ name, slug, githubRepositoryId }` |
| Workspace (cloud) | `typeof v2Workspaces.$inferSelect` (has `projectId`, `hostId`) |
| Host (cloud) | `typeof v2Hosts.$inferSelect` (has `machineId`, `isOnline`) |
| Host-service project row | `typeof projects.$inferSelect` |
| Host-service workspace row | `typeof workspaces.$inferSelect` |
| Current host identity | `useLocalHostService().machineId` + `activeHostUrl` |
| Pinned-in-sidebar rows | `v2SidebarProjects` / `v2WorkspaceLocalState` (localStorage) |

---

## Sidebar integration

### Visibility rule

**Pin alone.** A pinned project (`v2SidebarProjects` row) always renders. Backing health shows as row state, never as a filter. Users don't lose their place when a host goes offline. Pin-management (auto-pin, cross-device pin sync, unpin UX) is tuned separately — pin is a binary input to this design.

### Backing derivation (client-side)

Two sources, combined in `useDashboardSidebarData`. Nothing new gets synced.

**Local backing** — authoritative, lag-free. Calls the local daemon:

```ts
const { data: localBacked } = useQuery({
  queryKey: ["project", "list"],
  queryFn: () => activeHostClient.project.list.query(),
})
// Map<projectId, { repoPath, pathStatus }>
```

**Remote backing** — Electric-derived, tolerates sync lag. Leans on `ensureMainWorkspace` (every backing has ≥1 workspace):

```ts
const { data: remoteBacked } = useLiveQuery(q => q
  .from({ ws: collections.v2Workspaces })
  .innerJoin({ h: collections.v2Hosts }, ({ ws, h }) => eq(ws.hostId, h.id))
  .where(({ h }) => ne(h.machineId, currentMachineId))
  .groupBy(({ ws }) => ws.projectId, ({ h }) => h.isOnline)
)
// → derived into Map<projectId, { online: Set<hostId>; offline: Set<hostId> }>
```

Both online and offline remote backings are surfaced — offline is what drives the "Host offline" row state.

### Row state (per pinned project)

| Row state | Condition | CTA |
| --- | --- | --- |
| Normal | local backing `healthy`, or any `remoteBacked.online` host | open / new workspace |
| Stale path | local backing exists with `pathStatus: "missing"` | Repair (→ `project.setup` with `acknowledgeWorkspaceInvalidation`) |
| Host offline | no local backing, no online remote backing, but `remoteBacked.offline` non-empty | passive; reconnect restores |
| Not set up here | no local backing, no remote backing at all | "Set up here" inline (→ `project.setup`) |

### Workspace row

- **Host chip** — `current-host | remote-device | cloud`, from the existing `hostType` derivation (`v2Hosts.machineId === machineId`).
- **New workspace action** — local backing → creates directly; otherwise → inline setup-then-create (see companion doc).
- **Remote-device workspace click** — workspaces are bound to the host they were created on. Opening requires being on that host. Click lands on a "switch host or set up here" stub page (Phase 3; companion doc).

---

## Available surface (discovery)

Cloud projects in the user's org that aren't pinned locally. Two entry points:

- **"Pin & set up"** → adds pin + runs `project.setup`.
- **"+ New project"** → `project.create`.

Pins never fall out of the sidebar, so Available is strictly for first-time pinning.

---

## User journeys

**Legend:** laptop + desktop, both connected unless noted. "Pin" = localStorage, per-device.

### 1. New user, new org — first project

| Step | Host-service | Cloud | Pin | Sidebar | Available |
| --- | --- | --- | --- | --- | --- |
| start | — | — | — | empty | empty |
| "+ New project" → `project.create` | row + main ws | row | pinned | project, Normal | — |

### 2. Join an org with existing projects

| Step | Host-service | Pin | Sidebar | Available |
| --- | --- | --- | --- | --- |
| start | — | — | empty | every teammate project |
| "Pin & set up" → `project.setup` | row + main ws | pinned | the one project, Normal | rest |

Teammates' hosts belong to their own `v2_users_hosts` — no remote backing contribution. Available is the path in.

### 3. Adding a second host

| Step | Laptop host-svc | Desktop host-svc | Desktop pins | Desktop sidebar | Desktop Available |
| --- | --- | --- | --- | --- | --- |
| before (user on laptop) | A, B | — | — | — | — |
| log into desktop | unchanged | — | — | empty | A, B |
| "Pin & set up" A on desktop | unchanged | A | A | A, Normal | B |

Desktop starts empty (no pins on this device). Cross-device pin sync is pin-tuning.

### 4. Same project backed on both hosts

| Event | `v2_workspaces` | Laptop sidebar | Desktop sidebar |
| --- | --- | --- | --- |
| both backed, main workspaces only | main-L, main-D | main-L (local), main-D (remote) | main-L (remote), main-D (local) |
| laptop creates α | \+ α (hostId = L) | \+ α (local) | \+ α (remote) |
| desktop creates β | \+ β (hostId = D) | \+ β (remote) | \+ β (local) |

Workspaces bound to creating host. Remote-device rows open the "switch host or set up here" stub, not the workspace directly.

### 5. A host goes offline

User on desktop, project pinned there. Laptop is the other host.

| State | Laptop online | Desktop backs it | Row state |
| --- | --- | --- | --- |
| both backed, both online | ✓ | ✓ | Normal |
| laptop offline, desktop backs it | — | ✓ | Normal |
| laptop offline, desktop doesn't | — | — | Host offline |
| neither host ever backed it | — | — | Not set up here |

Row state surfaces the problem; the pin stays.

---

## Flow summary

| Transition | RPC | Entry point | Row state flips |
| --- | --- | --- | --- |
| nothing → cell 2 | `project.create` | Available "+ New project" | Normal immediately |
| cell 1 → cell 2 | `project.setup` | Available "Pin & set up", sidebar "Set up here" CTA | Normal immediately |
| cell 3 → cell 2 | `project.setup` (`acknowledgeWorkspaceInvalidation: true`) | Stale-path Repair CTA | Normal immediately |
| first-workspace-on-new-host | workspace.create throw → inline `project.setup` → retry | New Workspace modal | Normal immediately |

---

## Open questions

1. **Disambiguation on import.** If a folder's remote matches multiple cloud projects (forks), `project.setup` needs `projectId` — the caller must already have picked. A "browse a folder → which project?" picker only if a concrete entry point needs it.
2. **GitHub auth for repo creation.** Likely cloud-side (GitHub App installation), fetched via `ctx.api`. Org-picker UX is a separate design.
3. **Template source.** Cloud records, curated registry, or user-provided? Mode exists in the RPC shape; implementation stubbed until decided.
4. **Mid-flow failure visibility.** With no rollback, a cloud row can exist without any host-service row. Available surfaces this naturally — decide whether the originating client also shows an inline "setup unfinished" recovery path.

Pin behavior (auto-pin on create/setup, cross-device pin sync, unpin UX) is out of scope here.

---

## Phasing

**Phase 1 — core backing-aware sidebar + create/setup**

- [ ] `project.list` procedure in host-service (local backing + `pathStatus`)

- [ ] `project.create` procedure: `clone` and `importLocal` modes; `empty`/`template` throw `not_implemented`. Enforces `ensureMainWorkspace`.

- [ ] `project.setup`: add `acknowledgeWorkspaceInvalidation`, create main workspace if missing, return `mainWorkspaceId`

- [ ] `useDashboardSidebarData` extended with `localBacked` + `remoteBacked` derivations and row-state per project

- [ ] Sidebar project row renders row state (Normal only surfaced; others stubbed as warning/offline markers)

- [ ] Available surface: "+ New project" and "Pin & set up" actions

- [ ] React Query invalidation on `["project", "list"]` after `project.create` / `project.setup` / `project.remove`

**Phase 2 — row-state polish**

- "Not set up here" and "Host offline" inline CTAs
- Host chips on workspace rows
- `ensureMainWorkspace` invariant enforcement in workspace-deletion paths

**Phase 3 — workspace-create inline setup**

- Throw integration (companion doc): `workspace.create` throws `PROJECT_NOT_SETUP`, client catches → `project.setup` → retry
- Remote-device workspace row → "switch host or set up here" stub

**Phase 4 — stale-path repair**

- Repair CTA on Stale-path rows → `project.setup` with `acknowledgeWorkspaceInvalidation`
- Workspace-invalidation confirmation UI