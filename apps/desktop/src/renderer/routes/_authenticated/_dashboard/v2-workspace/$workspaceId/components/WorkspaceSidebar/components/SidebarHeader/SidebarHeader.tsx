import { getSidebarHeaderTabButtonClassName } from "renderer/screens/main/components/WorkspaceView/RightSidebar/headerTabStyles";
import type { SidebarTabDefinition } from "../../types";

interface SidebarHeaderProps {
	tabs: SidebarTabDefinition[];
	activeTab: string;
	onTabChange: (id: string) => void;
}

export function SidebarHeader({
	tabs,
	activeTab,
	onTabChange,
}: SidebarHeaderProps) {
	const actions = tabs.find((t) => t.id === activeTab)?.actions;

	return (
		<div className="flex h-10 shrink-0 items-stretch border-b border-border">
			<div className="flex items-center h-full">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						className={getSidebarHeaderTabButtonClassName({
							isActive: activeTab === tab.id,
						})}
					>
						{tab.icon && <tab.icon className="size-3.5" />}
						{tab.label}
					</button>
				))}
			</div>
			<div className="flex-1" />
			{actions && (
				<div className="flex items-center h-10 pr-2 gap-0.5">{actions}</div>
			)}
		</div>
	);
}
