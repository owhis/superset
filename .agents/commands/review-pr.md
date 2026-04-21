# Review PR

Review an open pull request for code quality, correctness, and consistency with the project.

## Usage

```
review-pr <pr-number>
```

## Steps

1. **Fetch PR details**
   - Get the PR title, description, and diff using `gh pr view <pr-number> --json title,body,files`
   - Fetch the full diff with `gh pr diff <pr-number>`

2. **Understand the context**
   - Read the PR description to understand the intent
   - Identify which files were changed and what kind of change it is (feat, fix, refactor, etc.)
   - Check if there is a linked issue or plan document in `.agents/`

3. **Review the diff**
   - Check for correctness: does the code do what the PR claims?
   - Check for TypeScript type safety: are types explicit and accurate?
   - Check for consistency with existing patterns in the codebase
   - Look for potential runtime errors, null/undefined issues, or edge cases
   - Check that new functions and modules have appropriate comments/docstrings
   - Verify imports are clean and no unused variables remain

4. **Check tests**
   - Are new features covered by tests?
   - Are edge cases tested?
   - Do existing tests still pass conceptually given the changes?

5. **Check for common issues**
   - Console.log statements left in production code
   - Hardcoded secrets or credentials
   - TODO comments that should be resolved before merge
   - Overly large functions that should be split
   - Duplicate logic that could be extracted

6. **Summarize findings**
   - List any **blocking issues** (must fix before merge)
   - List any **suggestions** (non-blocking improvements)
   - List any **questions** for the author
   - Give an overall recommendation: `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`

7. **Post the review**
   - Use `gh pr review <pr-number> --comment --body "<review body>"` for a comment-only review
   - Use `gh pr review <pr-number> --approve --body "<review body>"` to approve
   - Use `gh pr review <pr-number> --request-changes --body "<review body>"` to request changes

## Review Comment Format

```
## PR Review: <title>

### Summary
<1-2 sentence overview of what the PR does>

### Blocking Issues
- [ ] <issue description> (`path/to/file.ts:line`)

### Suggestions
- <suggestion> (`path/to/file.ts:line`)

### Questions
- <question>

### Recommendation
**<APPROVE | REQUEST_CHANGES | COMMENT>** — <brief reason>
```

## Notes

- Be constructive and specific — reference file paths and line numbers where possible
- Distinguish clearly between blocking issues and optional improvements
- If the PR is straightforward and correct, approve promptly with a brief positive note
