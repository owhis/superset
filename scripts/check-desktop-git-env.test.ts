import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "check-desktop-git-env.sh");

describe("check-desktop-git-env.sh", () => {
	const scriptContent = readFileSync(SCRIPT_PATH, "utf-8");

	test("report_violation should increment failures counter, not assign 1", () => {
		// The report_violation function should use ((failures++)) instead of failures=1
		// so that it correctly counts the total number of violations found.
		//
		// With `failures=1`, if 3 violations are found, `failures` is still 1.
		// With `((failures++))`, it correctly becomes 3.

		const lines = scriptContent.split("\n");
		const reportViolationStart = lines.findIndex((l) =>
			l.startsWith("report_violation()"),
		);
		expect(reportViolationStart).not.toBe(-1);

		// Find the body of report_violation (up to closing brace)
		const reportViolationEnd = lines.findIndex(
			(l, i) => i > reportViolationStart && l.trim() === "}",
		);
		const body = lines.slice(reportViolationStart, reportViolationEnd + 1);

		// The function must not use `failures=1` (assignment) — it should increment
		const hasAssignment = body.some((l) => /\bfailures=1\b/.test(l));
		const hasIncrement = body.some(
			(l) =>
				/\(\(failures\+\+\)\)/.test(l) ||
				/\(\(failures\s*\+=\s*1\)\)/.test(l) ||
				/failures=\$\(\(failures\s*\+\s*1\)\)/.test(l),
		);

		expect(hasAssignment).toBe(false);
		expect(hasIncrement).toBe(true);
	});
});
