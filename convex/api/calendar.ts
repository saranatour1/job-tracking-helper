// Registers `api.api.calendar.*`. Definitions live in ../features/calendar.
import { calendarApi } from "../features/calendar/public"

export const { list, save, remove, settings, saveSettings } = calendarApi
