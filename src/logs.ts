/** Shared log ring used by the terminal panel.
 *
 *  Entries carry the wall-clock time they were appended at, so the terminal
 *  shows when each line happened instead of recomputing "now" on every render
 *  (all rows used to display the time of the last re-render). */

export interface LogEntry {
    id: number;
    /** Local time at append, HH:MM:SS 24h. */
    time: string;
    text: string;
}

export const LOG_CAP = 100;

let nextLogId = 1;

function timestamp(): string {
    return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Append one line or a batch of lines to the log, keeping the newest
 *  LOG_CAP entries. The single append path also unifies the two cap
 *  calculations that previously drifted (one capped at 101, the other up to
 *  200 when a scrcpy-log burst exceeded 100 lines at once). */
export function appendLogs(prev: LogEntry[], lines: string | string[]): LogEntry[] {
    const incoming = (Array.isArray(lines) ? lines : [lines]).map(text => ({
        id: nextLogId++,
        time: timestamp(),
        text
    }));
    return [...prev, ...incoming].slice(-LOG_CAP);
}
