export const WHEEL_STEP_DEGREES = 25; // observed default of dragStepDegrees
export const WHEEL_ENGAGE_DEGREES = 8; // travel before a press becomes a drag
export const TRACK_SECONDS = 30; // preview-like duration
export const LIST_ROWS = 6;

export const REPEAT = { OFF: "off", SONG: "song", ALL: "all" } as const;
export const BACKLIGHT_ALWAYS = -1;
export const BACKLIGHT_ORDER = [0, 1, 2, 3, 5, BACKLIGHT_ALWAYS];
export const REPEAT_ORDER = [REPEAT.OFF, REPEAT.SONG, REPEAT.ALL];

