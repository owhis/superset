# run-tests

Run the test suite for the superset project, report results, and surface any failures.

## Usage

```
/run-tests [scope] [--watch] [--coverage]
```

## Arguments

- `scope` (optional): Limit tests to a specific area. Examples:
  - `frontend` — run only Jest/frontend tests
  - `backend` — run only Python/pytest tests
  - `e2e` — run Cypress end-to-end tests
  - Omit to run all test suites
- `--watch` — run in watch mode (frontend only)
- `--coverage` — collect and report coverage

## Steps

1. **Determine scope** from the argument or default to `all`.

2. **Frontend tests** (when scope is `frontend` or `all`):
   ```bash
   cd superset-frontend
   npm run test -- --watchAll=false $(if coverage: --coverage)
   ```
   - Capture exit code and stdout/stderr.
   - Parse Jest summary line: `Tests: X failed, Y passed, Z total`.
   - If any failures, collect the list of failing test files.

3. **Backend tests** (when scope is `backend` or `all`):
   ```bash
   pytest tests/ -x --tb=short $(if coverage: --cov=superset --cov-report=term-missing)
   ```
   - Capture exit code and stdout/stderr.
   - Parse pytest summary: `X failed, Y passed in Zs`.
   - If any failures, collect test names and short tracebacks.

4. **End-to-end tests** (when scope is `e2e`):
   ```bash
   cd superset-frontend
   npx cypress run --headless
   ```
   - Capture exit code.
   - Report passing/failing spec files.

5. **Summarise results** in a structured format:

   ```
   ## Test Results

   | Suite    | Passed | Failed | Skipped | Duration |
   |----------|--------|--------|---------|----------|
   | Frontend | 412    | 0      | 3       | 45s      |
   | Backend  | 1 203  | 2      | 11      | 2m 14s   |

   ### Failures

   **Backend**
   - `tests/charts/test_api.py::TestChartApi::test_get_chart` — AssertionError: 404 != 200
   - `tests/dashboards/test_dao.py::TestDashboardDAO::test_create` — IntegrityError: ...
   ```

6. **Exit behaviour**:
   - If all suites pass → print summary and exit 0.
   - If any suite fails → print summary with failures highlighted and exit 1.

## Notes

- Always run from the repository root unless a suite requires a subdirectory.
- Do **not** start or stop Docker services; assume the environment is already running.
- For CI contexts (detected via `CI=true`) suppress interactive prompts and use non-TTY output flags.
- If `--coverage` is passed, append coverage report paths to the summary.
