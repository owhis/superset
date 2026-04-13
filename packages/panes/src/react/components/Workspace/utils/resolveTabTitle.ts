import type { Tab } from "../../../../types";
import type { PaneRegistry } from "../../../types";

export function resolveTabTitle<TData>(
	tab: Tab<TData>,
	tabs: Tab<TData>[],
	registry: PaneRegistry<TData>,
): string {
	if (tab.titleOverride) return tab.titleOverride;
	const panes = Object.values(tab.panes);
	const onlyPane = panes.length === 1 ? panes[0] : undefined;
	if (onlyPane) {
		const fromRegistry = registry[onlyPane.kind]?.getTitle?.(onlyPane);
		if (fromRegistry) return fromRegistry;
	}
	return `Tab ${tabs.indexOf(tab) + 1}`;
}
