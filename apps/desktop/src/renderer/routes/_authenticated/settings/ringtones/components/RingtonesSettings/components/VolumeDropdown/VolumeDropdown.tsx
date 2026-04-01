import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback, useEffect, useState } from "react";
import { HiInformationCircle, HiSpeakerWave } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

const isWindows = process.platform === "win32";

const VOLUME_LEVELS = [
	{ value: 0, label: "Muted", description: "No sound" },
	{ value: 20, label: "Quiet", description: "Very soft" },
	{ value: 40, label: "Low", description: "Soft" },
	{ value: 60, label: "Medium", description: "Moderate" },
	{ value: 80, label: "High", description: "Loud" },
	{ value: 100, label: "Maximum", description: "Full volume" },
] as const;

function getVolumeLabel(volume: number): string {
	const level = VOLUME_LEVELS.find((l) => l.value === volume);
	return level ? level.label : "Custom";
}

export function VolumeDropdown() {
	const [localVolume, setLocalVolume] = useState<number | null>(null);

	const utils = electronTrpc.useUtils();
	const { data: volumeData, isLoading: volumeLoading } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const volume = localVolume ?? volumeData ?? 100;

	const setVolume = electronTrpc.settings.setNotificationVolume.useMutation({
		onMutate: async ({ volume }) => {
			await utils.settings.getNotificationVolume.cancel();
			const previous = utils.settings.getNotificationVolume.getData();
			utils.settings.getNotificationVolume.setData(undefined, volume);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getNotificationVolume.setData(
					undefined,
					context.previous,
				);
			}
			setLocalVolume(null);
		},
		onSettled: async () => {
			await utils.settings.getNotificationVolume.invalidate();
			setLocalVolume(null);
		},
	});

	useEffect(() => {
		if (volumeData !== undefined && localVolume === null) {
			setLocalVolume(volumeData);
		}
	}, [volumeData, localVolume]);

	const handleVolumeChange = useCallback(
		(value: string) => {
			const newVolume = Number.parseInt(value, 10);
			setLocalVolume(newVolume);
			setVolume.mutate({ volume: newVolume });
		},
		[setVolume],
	);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<HiSpeakerWave className="h-5 w-5 text-muted-foreground flex-shrink-0" />
					<Label htmlFor="notification-volume" className="text-sm font-medium">
						Volume
					</Label>
				</div>
				<Select
					value={volume.toString()}
					onValueChange={handleVolumeChange}
					disabled={volumeLoading}
				>
					<SelectTrigger id="notification-volume" className="w-[200px]">
						<SelectValue>
							<span className="flex items-center gap-2">
								<span className="font-medium">{getVolumeLabel(volume)}</span>
								<span className="text-muted-foreground">({volume}%)</span>
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{VOLUME_LEVELS.map((level) => (
							<SelectItem key={level.value} value={level.value.toString()}>
								<div className="flex items-center gap-2">
									<span className="font-medium">{level.label}</span>
									<span className="text-muted-foreground text-xs">
										({level.value}%)
									</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{isWindows && (
				<div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
					<HiInformationCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
					<p>
						Volume control is not supported on Windows due to system
						limitations. Notifications will play at system volume.
					</p>
				</div>
			)}
		</div>
	);
}
