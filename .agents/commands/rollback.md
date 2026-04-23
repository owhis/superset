# Rollback Command

Rollback a recent change or deployment to a previous stable state.

## Usage

```
rollback [target] [--to <commit|tag|version>] [--dry-run]
```

## Arguments

- `target` — What to roll back: `migration`, `dependency`, `feature`, or `deploy`
- `--to` — Specific commit SHA, git tag, or version string to roll back to
- `--dry-run` — Preview what would be rolled back without making changes

## Steps

### 1. Identify Rollback Target

- If `--to` is provided, resolve it to a specific commit
- Otherwise, find the last known-good state from git log or release tags
- Check `CHANGELOG.md` or recent PR merges to understand what changed

### 2. Validate Safety

- Run `git log --oneline -20` to review recent commits
- Check if any database migrations are involved (`superset db heads`)
- If migrations exist, warn the user that data rollback may be required
- Confirm with user before proceeding if `--dry-run` is not set

### 3. Execute Rollback

#### For `dependency` target:
```bash
git checkout <commit> -- package.json yarn.lock
yarn install --frozen-lockfile
```

#### For `migration` target:
```bash
# List current heads
superset db heads

# Downgrade to previous revision
superset db downgrade <revision>
```

#### For `feature` target:
```bash
# Revert the merge commit
git revert -m 1 <merge-commit-sha>
git push origin HEAD
```

#### For `deploy` target:
```bash
# Tag the rollback point
git tag rollback-$(date +%Y%m%d%H%M%S)

# Reset to target
git reset --hard <commit>
git push --force-with-lease origin HEAD
```

### 4. Verify

- Run `yarn build` or relevant build step to confirm the rolled-back state compiles
- Execute `yarn test --passWithNoTests` to check for regressions
- If CI is configured, trigger a CI check using the `ci-check` command

### 5. Document

- Create a brief rollback note in the PR or issue tracker
- Format: `[ROLLBACK] Reverted <target> to <version/commit> — Reason: <reason>`
- Update `CHANGELOG.md` if this affects a public release

## Safety Notes

- Always prefer `git revert` over `git reset --hard` on shared branches
- Never force-push to `main` or `master` without team approval
- Database migration rollbacks may cause data loss — confirm with DBA if in production
- Use `--dry-run` first when unsure
