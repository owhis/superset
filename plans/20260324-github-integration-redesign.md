# GitHub Integration RFC

## Status

Proposed

## Decision

Treat GitHub as a webhook-first GitHub App integration, not as a Slack/Linear-style callback-owned OAuth integration.

Keep the tactical fix in this branch, but move the long-term design to:

- admin-only install/manage/disconnect
- explicit install sessions
- a dedicated GitHub setup endpoint
- webhook-owned lifecycle state
- reconcile sync as repair

## Why

Current repo patterns:

- Slack and Linear use standard OAuth callbacks and store one `integrationConnections` row.
- GitHub already uses separate provider tables and webhook-driven repo state:
  - `github_installations`
  - `github_repositories`
  - `github_pull_requests`

That means GitHub is structurally different from Slack and Linear.

Provider comparison:

| Provider | Model | Callback is source of truth? | Webhooks required for correctness? |
| --- | --- | --- | --- |
| Slack | OAuth | Yes | No |
| Linear | OAuth | Yes | No |
| GitHub | GitHub App installation | No | Yes |

GitHub docs support this:

- setup URL receives `installation_id` and GitHub warns not to trust `installation_id` by itself:
  - https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
- install links can carry `state` and GitHub may return it after install/update flows:
  - https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app
- GitHub documents `setup_url`, `setup_on_update`, and `request_oauth_on_install`:
  - https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters

## Problem

We treated GitHub setup/update redirects like OAuth callbacks.

That is brittle because GitHub install state also changes through:

- installation updates
- repository selection changes
- suspend / unsuspend
- delete
- webhook delivery success or failure

## Architecture

### `/api/github/install`

- require Superset org admin or owner
- create a short-lived install session
- redirect to GitHub with signed nonce/state

### `/api/github/setup`

- handle GitHub setup/install/update redirects
- read `installation_id` and `setup_action`
- only create a new org link from a valid pending install session
- if the installation is already linked, refresh metadata and queue reconcile work
- never create a new org link from an unbound update redirect

### `/api/github/webhook`

- remain canonical for:
  - installation deleted
  - suspend / unsuspend
  - repositories added / removed

### Reconcile sync

- compare GitHub-accessible repos with DB state
- remove stale repos
- refresh PR data
- heal missed webhooks

The new `apps/api/src/app/api/github/sync-installation.ts` helper is the correct base for this.

## Data Model

Add a short-lived install-session table:

```ts
githubInstallSessions {
  id: uuid
  organizationId: uuid
  initiatingUserId: uuid
  nonce: text
  status: "pending" | "completed" | "expired" | "cancelled"
  expiresAt: timestamp
  createdAt: timestamp
  completedAt: timestamp | null
}
```

Purpose:

- bind an in-app admin action to one org
- audit setup redirects
- prevent stale or unsigned redirects from creating new links

## Rollout

1. Make GitHub install/manage admin-only.
2. Add `github_install_sessions`.
3. Add `/api/github/setup`.
4. Move org-link finalization out of the current callback path.
5. Configure the GitHub App with a documented setup URL and redirect-on-update behavior.
6. Keep webhooks as primary lifecycle handlers.
7. Use reconcile sync as repair and observability.

## Non-Goal

Do not keep forcing GitHub into the Slack/Linear callback-owned model.
