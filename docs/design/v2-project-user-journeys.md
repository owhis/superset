# V2 Project User Journeys

Traces the state machine in [`v2-project-create-import.md`](./v2-project-create-import.md). Each scenario tracks four things per host: cloud `v2_projects` row, host-service `projects` row, localStorage pin, online flag.

A project is **backed on a host** if that host has a `host-service.projects` row for it. Two ways the client learns about backing:
- **Local backing** — the host the user is currently sitting at, read via local host-service `project.list`.
- **Remote backing** — any other host the user has access to (`v2_users_hosts`) that's online, derived from Electric-synced `v2_workspaces ⋈ v2_hosts`.

---

## 1. New user, new org — first project

| Step | Host-service | Cloud project | Pin | Sidebar | Available |
|---|---|---|---|---|---|
| start | — | — | — | empty | empty |
| "+ New project" → `project.create` | row + main workspace | row created | auto | project visible | — |

Local backing flips immediately.

---

## 2. Join an org with existing projects

| Step | Host-service | Pin | Sidebar | Available |
|---|---|---|---|---|
| start | — | — | empty | every teammate project |
| "Set up here" → `project.setup` | row + main workspace | auto | the one project | rest |

Teammates' hosts belong to their own `v2_users_hosts`, so they don't contribute remote backing for this user. The only path into the sidebar is running setup.

Edge case: if the user was granted access to a teammate's host (shared workstation), that online host *does* contribute remote backing — the project shows in the sidebar without setup, and clicking "New workspace" throws into inline setup.

---

## 3. Adding a second host

Starting state: laptop has been in use, desktop is fresh. Both online after login.

| Step | Laptop host-service | Desktop host-service | Laptop pins | Desktop pins | Desktop sidebar | Desktop Available |
|---|---|---|---|---|---|---|
| before | project A, project B | — | A, B | — | — | — |
| log into desktop | unchanged | — | A, B | — | **?** | **?** |
| set up project A on desktop | unchanged | project A | A, B | A | A | B |

**The "?" row is a design choice** — on first login the desktop has no pins:
- **Strict (default):** desktop sidebar is empty; A and B appear in Available as remote-backed. User opts in to what they want locally.
- **Permissive:** promote pins to cloud so they follow the user across hosts — desktop sidebar auto-populates.

See open question #6.

---

## 4. Same project backed on both hosts

| Event | Cloud `v2_workspaces` | Laptop sidebar | Desktop sidebar |
|---|---|---|---|
| both backed, no extra workspaces | main-on-laptop, main-on-desktop | main-on-laptop (local), main-on-desktop (remote) | main-on-laptop (remote), main-on-desktop (local) |
| user on laptop creates workspace α | + α (hostId = laptop) | + α (local) | + α (remote) |
| user on desktop creates workspace β | + β (hostId = desktop) | + β (remote) | + β (local) |

Workspaces are bound to the host they were created on. Clicking a row marked "remote" takes the user to a "switch host or set up here" page — it doesn't open the workspace directly.

---

## 5. A host goes offline

User is on desktop. Laptop is the other host.

| State | Laptop online | Desktop online | Desktop sees the project via | Desktop sidebar |
|---|---|---|---|---|
| both backed, both online | ✓ | ✓ | local + remote backing | project visible |
| laptop offline, desktop backs it | — | ✓ | local only | project visible |
| laptop offline, desktop doesn't back it | — | ✓ | neither | moves to Available (pin kept) |

Pins are not deleted when backing disappears — the project is demoted to Available and rehydrates into the sidebar the moment a backing host comes back.
