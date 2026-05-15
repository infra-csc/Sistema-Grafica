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
  return new Date(dateStr + "T12:00:00");
}
