# sync-fork

Sync the fork with the upstream superset-sh/superset repository.

## Usage

```
sync-fork [--branch <branch>] [--dry-run]
```

## Options

- `--branch <branch>`: The branch to sync (default: `main`)
- `--dry-run`: Show what would happen without making changes

## Steps

1. **Verify remotes are configured**
   ```bash
   git remote -v
   ```
   Ensure `upstream` points to `https://github.com/superset-sh/superset.git`.
   If not, add it:
   ```bash
   git remote add upstream https://github.com/superset-sh/superset.git
   ```

2. **Fetch upstream changes**
   ```bash
   git fetch upstream
   ```

3. **Check out the target branch**
   ```bash
   git checkout <branch>
   ```

4. **Identify divergence**
   ```bash
   git log --oneline upstream/<branch>..HEAD
   ```
   Report how many commits the fork is ahead/behind upstream.

5. **Merge upstream into the branch**
   ```bash
   git merge upstream/<branch> --no-edit
   ```
   If conflicts arise, list the conflicting files and pause for manual resolution.

6. **Run CI check** (optional but recommended)
   Invoke the `ci-check` command to validate the merged state before pushing.

7. **Push to origin**
   ```bash
   git push origin <branch>
   ```

## Notes

- Always create a backup branch before syncing if there are uncommitted local changes.
- If the merge produces conflicts in fork-specific customisation files (e.g. `superset/config.py` overrides), prefer the fork version and document the resolution in the PR description.
- After syncing, run `refresh-compare-pages` to update any comparison pages that track differences between the fork and upstream.
