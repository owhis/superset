/**
 * Parses a Linear issue URL and extracts the issue identifier.
 *
 * @param url - The URL string to parse (e.g., "https://linear.app/superset-sh/issue/SUPER-387/test-issue")
 * @returns The issue identifier (e.g., "SUPER-387") or null if not found
 *
 * @example
 * ```typescript
 * parseLinearIssueIdentifier("https://linear.app/superset-sh/issue/SUPER-387/test-issue")
 * // Returns: "SUPER-387"
 *
 * parseLinearIssueIdentifier("not a linear url")
 * // Returns: null
 * ```
 */
export function parseLinearIssueIdentifier(url: string): string | null {
	// Match Linear URLs with pattern: linear.app/{workspace}/issue/{IDENTIFIER}/...
	// Identifier format: uppercase letters, hyphen, digits (e.g., SUPER-387)
	const regex = /linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/;
	const match = url.match(regex);

	return match?.[1] ?? null;
}
