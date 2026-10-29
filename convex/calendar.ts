// Registers `api.calendar.*`. Definitions live in ./api/features/calendar.
import { calendarApi } from "./api/features/calendar/public"

export const { list, save, remove, settings, saveSettings } = calendarApi
