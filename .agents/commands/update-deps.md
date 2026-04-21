# Update Dependencies

Update npm/pip dependencies for the superset fork, keeping in sync with upstream while preserving any fork-specific pinned versions.

## Steps

1. **Check current dependency status**
   ```bash
   # Frontend
   cd superset-frontend && npm outdated
   
   # Backend
   pip list --outdated
   ```

2. **Identify upstream changes**
   - Compare `package.json` and `requirements/*.txt` with upstream `superset-sh/superset`
   - Note any fork-specific pins in `.agents/config/pinned-deps.json` if present

3. **Update frontend dependencies**
   ```bash
   cd superset-frontend
   # Update non-breaking patch/minor versions
   npm update
   # For major version bumps, update individually and test
   npm install <package>@latest
   ```

4. **Update backend dependencies**
   ```bash
   # Update requirements files
   pip-compile requirements/base.in
   pip-compile requirements/development.in
   pip-compile requirements/testing.in
   ```

5. **Run CI checks after updates**
   - Use `/ci-check` command to validate changes
   - Pay special attention to breaking changes in major version bumps

6. **Create PR with changes**
   - Group dependency updates logically (security, feature, maintenance)
   - Use `/create-pr` command with label `dependencies`

## Notes

- Always check the CHANGELOG of major version bumps before updating
- Security vulnerabilities should be patched immediately via a dedicated PR
- Run `npm audit` and `safety check` before finalizing updates
