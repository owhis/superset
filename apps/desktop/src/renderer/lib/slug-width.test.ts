import { describe, expect, test } from "bun:test";
import { getSlugColumnWidth } from "./slug-width";

describe("getSlugColumnWidth", () => {
	test("returns default width for empty array", () => {
		expect(getSlugColumnWidth([])).toBe("5rem");
	});

	test("calculates width based on longest slug", () => {
		const result = getSlugColumnWidth(["AB-1", "ABC-12"]);
		// ABC-12 = 6 chars, width = 6 * 0.375 + 0.5 = 2.75 → "2.8rem"
		expect(result).toBe("2.8rem");
	});

	test("accommodates long Linear issue IDs without truncation", () => {
		// Issue #3112: slugs like "WONDER-267" (10 chars) or longer should not be capped
		const slugs = ["WONDER-267", "WONDER-1234"];
		const width = getSlugColumnWidth(slugs);

		// WONDER-1234 = 11 chars, width = 11 * 0.375 + 0.5 = 4.625 → "4.7rem"
		expect(width).toBe("4.7rem");
	});

	test("handles slugs longer than 11 characters", () => {
		// Previously MAX_SLUG_LENGTH=11 would truncate these
		const slugs = ["LONGPROJECT-9999"]; // 16 chars
		const width = getSlugColumnWidth(slugs);

		// 16 * 0.375 + 0.5 = 6.5 → "6.5rem"
		expect(width).toBe("6.5rem");
	});
});
