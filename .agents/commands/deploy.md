# Deploy Command

Deploys the application to the target environment.

## Usage

```
deploy [environment] [options]
```

## Arguments

- `environment` — Target environment to deploy to. One of: `staging`, `production`. Defaults to `staging`.

## Options

- `--skip-tests` — Skip running tests before deploying (not recommended for production).
- `--dry-run` — Print the deployment steps without executing them.
- `--tag <tag>` — Deploy a specific git tag instead of the current branch HEAD.
- `--rollback` — Trigger a rollback to the previous stable deployment. See also: `rollback.md`.

## Steps

1. **Pre-flight checks**
   - Verify the current branch is clean (no uncommitted changes).
   - For `production`, confirm the branch is `main` or a release tag.
   - Run `ci-check.md` unless `--skip-tests` is passed.

2. **Build**
   - Run `docker compose build` (or the configured build command).
   - Tag the resulting image with the current git SHA and the environment name.

3. **Push image**
   - Push the tagged image to the container registry.

4. **Database migrations**
   - Run any pending Alembic migrations against the target environment database.
   - On failure, abort the deploy and alert the team.

5. **Deploy**
   - Apply the updated manifests / Helm chart values for the target environment.
   - Wait for the rollout to complete and all pods to become healthy.

6. **Smoke tests**
   - Hit the `/health` endpoint and assert HTTP 200.
   - Run the subset of integration tests tagged `smoke`.

7. **Post-deploy**
   - Create a GitHub deployment event linked to the commit SHA.
   - Post a summary to the `#deployments` Slack channel.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `REGISTRY_URL` | Yes | Container registry URL (e.g. `ghcr.io/org/superset`) |
| `KUBECONFIG` | Yes | Path to kubeconfig for the target cluster |
| `SLACK_WEBHOOK_URL` | No | Webhook URL for deployment notifications |
| `DATABASE_URL` | Yes | Connection string for the target environment DB |

## Examples

```bash
# Deploy current branch to staging
agent deploy staging

# Dry-run a production deploy from a release tag
agent deploy production --tag v2.1.0 --dry-run

# Deploy to production, skipping tests (emergency hotfix)
agent deploy production --skip-tests
```

## Notes

- Production deploys require two-person approval via GitHub environment protection rules.
- If the rollout fails, the command will automatically invoke the `rollback` command and exit with code 1.
- See `rollback.md` for manual rollback instructions.
