import { describe, expect, mock, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";
import { createHelpSubmenu } from "./help-submenu";

function findItem(
	items: Electron.MenuItemConstructorOptions[],
	label: string,
): Electron.MenuItemConstructorOptions | undefined {
	return items.find((item) => item.label === label);
}

describe("createHelpSubmenu", () => {
	test("Contact Us does not fire a direct mailto click (bug #3534)", () => {
		const openExternal = mock(() => {});
		const submenu = createHelpSubmenu({
			openExternal,
			emitOpenSettings: mock(() => {}),
			keyboardAccelerator: "CmdOrCtrl+/",
		});

		const contactUs = findItem(submenu, "Contact Us");
		expect(contactUs).toBeDefined();

		// Bug: Contact Us previously had a direct click that opened mailto:,
		// which just activated the browser/mail client instead of opening a page.
		// It should now be a submenu of contact options, not a direct click.
		expect(contactUs?.click).toBeUndefined();
		expect(contactUs?.submenu).toBeDefined();
	});

	test("Contact Us submenu has page-opening entries plus email", () => {
		const openExternal = mock((_url: string) => {});
		const submenu = createHelpSubmenu({
			openExternal,
			emitOpenSettings: mock(() => {}),
			keyboardAccelerator: "CmdOrCtrl+/",
		});

		const contactUs = findItem(submenu, "Contact Us");
		const children = contactUs?.submenu as
			| Electron.MenuItemConstructorOptions[]
			| undefined;
		expect(Array.isArray(children)).toBe(true);

		const labels = (children ?? []).map((c) => c.label);
		expect(labels).toEqual(["GitHub", "Discord", "X", "Email Founders"]);

		findItem(children ?? [], "GitHub")?.click?.(
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			undefined as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
		);
		expect(openExternal).toHaveBeenCalledWith(COMPANY.GITHUB_URL);

		findItem(children ?? [], "Email Founders")?.click?.(
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			undefined as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
		);
		expect(openExternal).toHaveBeenCalledWith(COMPANY.MAIL_TO);
	});

	test("Documentation and Report Issue still open pages", () => {
		const openExternal = mock((_url: string) => {});
		const submenu = createHelpSubmenu({
			openExternal,
			emitOpenSettings: mock(() => {}),
			keyboardAccelerator: "CmdOrCtrl+/",
		});

		findItem(submenu, "Documentation")?.click?.(
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			undefined as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
		);
		expect(openExternal).toHaveBeenCalledWith(COMPANY.DOCS_URL);

		findItem(submenu, "Report Issue")?.click?.(
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			undefined as any,
			// biome-ignore lint/suspicious/noExplicitAny: only click is invoked
			null as any,
		);
		expect(openExternal).toHaveBeenCalledWith(COMPANY.REPORT_ISSUE_URL);
	});
});
