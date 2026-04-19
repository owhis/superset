import {
	getEnabledAgentConfigs,
	type ResolvedAgentConfig,
} from "@superset/shared/agent-settings";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import { useMemo } from "react";
import { HiCheck } from "react-icons/hi2";
import { LuCpu } from "react-icons/lu";
import {
	useIsDarkTheme,
	usePresetIcon,
} from "renderer/assets/app-icons/preset-icons";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface AgentPickerProps {
	value: string;
	onChange: (next: string) => void;
	className?: string;
}

export function AgentPicker({ value, onChange, className }: AgentPickerProps) {
	const agentPresetsQuery = electronTrpc.settings.getAgentPresets.useQuery();
	const enabledAgents: ResolvedAgentConfig[] = useMemo(
		() => getEnabledAgentConfigs(agentPresetsQuery.data ?? []),
		[agentPresetsQuery.data],
	);
	const isDark = useIsDarkTheme();
	const selectedAgent = enabledAgents.find((agent) => agent.id === value);
	const selectedIcon = usePresetIcon(value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<PickerTrigger
					className={className}
					icon={
						selectedIcon ? (
							<img
								src={selectedIcon}
								alt=""
								className="size-3.5 shrink-0 object-contain"
							/>
						) : (
							<LuCpu className="size-4 shrink-0" />
						)
					}
					label={selectedAgent?.label ?? "Select agent"}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{enabledAgents.map((agent) => {
					const icon = getPresetIcon(agent.id, isDark);
					return (
						<DropdownMenuItem
							key={agent.id}
							onSelect={() => onChange(agent.id)}
						>
							{icon ? (
								<img
									src={icon}
									alt=""
									className="size-3.5 shrink-0 object-contain"
								/>
							) : (
								<LuCpu className="size-4 shrink-0" />
							)}
							<span className="flex-1 truncate">{agent.label}</span>
							{value === agent.id && <HiCheck className="size-4" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
