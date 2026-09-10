export function pad2(value: number): string {
  return Math.floor(value).toString().padStart(2, '0')
}

/** Media clock: `M:SS` or `H:MM:SS`. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(rest)}`
  return `${minutes}:${pad2(rest)}`
}

/** 24-hour wall clock `HH:MM:SS` from a Unix timestamp in seconds. */
export function formatTime24(seconds: number): string {
  const date = new Date(seconds * 1000)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Short day label for EPG rows — Today, Tomorrow, or `Wed, Sep 9`. */
export function formatEpgDay(ms: number, now = Date.now()): string {
  const date = new Date(ms)
  const today = new Date(now)
  if (sameCalendarDay(date, today)) return 'Today'
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (sameCalendarDay(date, tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Programme window with calendar day and wall-clock times (milliseconds). */
export function formatEpgRange(start: number, stop: number, now = Date.now()): string {
  const startDate = new Date(start)
  const stopDate = new Date(stop)
  const startDay = formatEpgDay(start, now)
  const stopDay = formatEpgDay(stop, now)
  const startClock = formatTime24(start / 1000)
  const stopClock = formatTime24(stop / 1000)
  if (startDay === stopDay) return `${startDay} · ${startClock} – ${stopClock}`
  return `${startDay} ${startClock} – ${stopDay} ${stopClock}`
}

export function isUnixTimestamp(seconds: number, unixFlag: boolean): boolean {
  return unixFlag || seconds >= 1_000_000_000
}

export function formatPlayhead(
  seconds: number,
  options: { live: boolean; unix: boolean },
): string {
  if (options.live && isUnixTimestamp(seconds, options.unix)) return formatTime24(seconds)
  return formatClock(seconds)
}
