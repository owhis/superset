import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { HiCheck } from "react-icons/hi2";
import { LuClock } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { CUSTOM_SCHEDULE_KEY, SCHEDULE_PRESETS } from "./constants";

interface SchedulePickerProps {
	scheduleKey: string;
	onScheduleKeyChange: (key: string) => void;
	customRrule: string;
	onCustomRruleChange: (rrule: string) => void;
	label: string;
	className?: string;
}

export function SchedulePicker({
	scheduleKey,
	onScheduleKeyChange,
	customRrule,
	onCustomRruleChange,
	label,
	className,
}: SchedulePickerProps) {
	const isCustom = scheduleKey === CUSTOM_SCHEDULE_KEY;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={<LuClock className="size-4 shrink-0" />}
					label={label}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-80" align="start">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						{SCHEDULE_PRESETS.map((preset) => (
							<button
								type="button"
								key={preset.key}
								onClick={() => onScheduleKeyChange(preset.key)}
								className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
							>
								<span>{preset.label}</span>
								{scheduleKey === preset.key && (
									<HiCheck className="size-4 text-muted-foreground" />
								)}
							</button>
						))}
						<button
							type="button"
							onClick={() => onScheduleKeyChange(CUSTOM_SCHEDULE_KEY)}
							className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
						>
							<span>Custom RRule…</span>
							{isCustom && <HiCheck className="size-4 text-muted-foreground" />}
						</button>
					</div>
					{isCustom && (
						<Input
							autoFocus
							placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
							className="font-mono text-xs"
							value={customRrule}
							onChange={(event) => onCustomRruleChange(event.target.value)}
						/>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
