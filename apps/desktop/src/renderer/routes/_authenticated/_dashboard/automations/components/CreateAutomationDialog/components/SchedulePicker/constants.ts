export interface SchedulePreset {
	key: string;
	label: string;
	rrule: string;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
	{
		key: "daily-9",
		label: "Daily at 9:00 AM",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "weekdays-9",
		label: "Weekdays at 9:00 AM",
		rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "weekly-mo",
		label: "Weekly on Monday 9:00 AM",
		rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "monthly-1",
		label: "Monthly on the 1st 9:00 AM",
		rrule: "FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0",
	},
	{
		key: "every-2m",
		label: "Every 2 minutes (smoke test)",
		rrule: "FREQ=MINUTELY;INTERVAL=2",
	},
];

export const CUSTOM_SCHEDULE_KEY = "__custom__";
