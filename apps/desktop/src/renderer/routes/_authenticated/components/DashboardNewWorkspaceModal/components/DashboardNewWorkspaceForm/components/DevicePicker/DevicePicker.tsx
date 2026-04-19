import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCloud,
	HiOutlineComputerDesktop,
	HiOutlineServer,
} from "react-icons/hi2";
import {
	useWorkspaceHostOptions,
	type WorkspaceHostOption,
} from "./hooks/useWorkspaceHostOptions";
import type { WorkspaceHostTarget } from "./types";

function OnlineDot({ online }: { online: boolean }) {
	return (
		<span
			aria-label={online ? "online" : "offline"}
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				online ? "bg-emerald-500" : "bg-muted-foreground/60",
			)}
		/>
	);
}

interface DevicePickerProps {
	hostTarget: WorkspaceHostTarget;
	onSelectHostTarget: (target: WorkspaceHostTarget) => void;
}

function getHostIcon(host: WorkspaceHostOption) {
	return host.isCloud ? HiOutlineCloud : HiOutlineComputerDesktop;
}

function getSelectedLabel(
	hostTarget: WorkspaceHostTarget,
	currentDeviceName: string | null,
	otherHosts: WorkspaceHostOption[],
) {
	if (hostTarget.kind === "local") {
		return currentDeviceName ?? "Local Device";
	}

	return (
		otherHosts.find((host) => host.id === hostTarget.hostId)?.name ??
		"Unknown Host"
	);
}

function getSelectedIcon(
	hostTarget: WorkspaceHostTarget,
	otherHosts: WorkspaceHostOption[],
) {
	if (hostTarget.kind === "local") {
		return <HiOutlineComputerDesktop className="size-4 shrink-0" />;
	}

	const host = otherHosts.find((h) => h.id === hostTarget.hostId);
	if (host?.isCloud) {
		return <HiOutlineCloud className="size-4 shrink-0" />;
	}

	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function DevicePicker({
	hostTarget,
	onSelectHostTarget,
}: DevicePickerProps) {
	const { currentDeviceName, otherHosts } = useWorkspaceHostOptions();
	const selectedLabel = getSelectedLabel(
		hostTarget,
		currentDeviceName,
		otherHosts,
	);
	// Only remote hosts have a meaningful online indicator — the app itself
	// is the local host, so it's tautologically online.
	const selectedRemoteOnline =
		hostTarget.kind === "host"
			? (otherHosts.find((host) => host.id === hostTarget.hostId)?.isOnline ??
				false)
			: null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
					<span className="flex min-w-0 items-center gap-1.5">
						{getSelectedIcon(hostTarget, otherHosts)}
						<span className="block w-[140px] truncate text-left">
							{selectedLabel}
						</span>
						{selectedRemoteOnline !== null && (
							<OnlineDot online={selectedRemoteOnline} />
						)}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuItem
					onSelect={() => onSelectHostTarget({ kind: "local" })}
				>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">Local Device</span>
					{hostTarget.kind === "local" && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				{otherHosts.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<HiOutlineServer className="size-4" />
								Other Hosts
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-72">
								{otherHosts.map((host) => {
									const HostIcon = getHostIcon(host);
									const isSelected =
										hostTarget.kind === "host" && hostTarget.hostId === host.id;

									return (
										<DropdownMenuItem
											key={host.id}
											onSelect={() =>
												onSelectHostTarget({
													kind: "host",
													hostId: host.id,
												})
											}
										>
											<HostIcon className="size-4" />
											<div className="min-w-0 flex-1">
												<div className="truncate">{host.name}</div>
											</div>
											<OnlineDot online={host.isOnline} />
											{isSelected && <HiCheck className="size-4" />}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
