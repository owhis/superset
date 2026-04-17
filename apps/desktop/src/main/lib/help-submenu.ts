import { COMPANY } from "@superset/shared/constants";

export type HelpSubmenuDeps = {
	openExternal: (url: string) => void;
	emitOpenSettings: (page?: string) => void;
	keyboardAccelerator: string;
};

export function createHelpSubmenu(
	deps: HelpSubmenuDeps,
): Electron.MenuItemConstructorOptions[] {
	return [
		{
			label: "Documentation",
			click: () => {
				deps.openExternal(COMPANY.DOCS_URL);
			},
		},
		{ type: "separator" },
		{
			label: "Contact Us",
			submenu: [
				{
					label: "GitHub",
					click: () => {
						deps.openExternal(COMPANY.GITHUB_URL);
					},
				},
				{
					label: "Discord",
					click: () => {
						deps.openExternal(COMPANY.DISCORD_URL);
					},
				},
				{
					label: "X",
					click: () => {
						deps.openExternal(COMPANY.X_URL);
					},
				},
				{
					label: "Email Founders",
					click: () => {
						deps.openExternal(COMPANY.MAIL_TO);
					},
				},
			],
		},
		{
			label: "Report Issue",
			click: () => {
				deps.openExternal(COMPANY.REPORT_ISSUE_URL);
			},
		},
		{ type: "separator" },
		{
			label: "Keyboard Shortcuts",
			accelerator: deps.keyboardAccelerator,
			click: () => {
				deps.emitOpenSettings("keyboard");
			},
		},
	];
}
