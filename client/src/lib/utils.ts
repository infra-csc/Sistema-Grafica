import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a YYYY-MM-DD date string as LOCAL noon to avoid UTC midnight
 * rolling back to the previous day in UTC-offset timezones (e.g. UTC-3).
 */
export function parseDateLocal(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.slice(0, 10) : dateStr;
  return new Date(datePart + "T12:00:00");
}

/**
 * truckDepartureDate is stored as UTC but the value the user typed (e.g. "15:11")
 * IS the intended local display time — no offset conversion was applied on save.
 * To make date-fns format() show the UTC value instead of the local value,
 * shift the Date by the browser's UTC offset so local rendering == UTC value.
 */
export function toUTCDisplayDate(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
}
