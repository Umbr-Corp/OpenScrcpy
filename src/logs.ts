/** Shared log ring used by the terminal panel.
 *
 *  Entries carry the wall-clock time they were appended at, so the terminal
 *  shows when each line happened instead of recomputing "now" on every render
 *  (all rows used to display the time of the last re-render). */

export type LogLevel = 'system' | 'warn' | 'err' | 'ok';

export interface LogEntry {
    id: number;
    /** Local time at append, HH:MM:SS 24h. */
    time: string;
    text: string;
    /** Structured severity, set by the emitter that knows what the line means.
     *  Colors obey this first and fall back to the text heuristic only for
     *  lines that carry no level (backend echo). Language agnostic: the
     *  heuristic word lists only recognize a few pt-BR/en words, so emitters
     *  that can pass a level should (frontend audit P2-4). */
    level?: LogLevel;
}

export const LOG_CAP = 100;

let nextLogId = 1;

function timestamp(): string {
    return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Append one line or a batch of lines to the log, keeping the newest
 *  LOG_CAP entries. The single append path also unifies the two cap
 *  calculations that previously drifted (one capped at 101, the other up to
 *  200 when a scrcpy-log burst exceeded 100 lines at once). `level` applies
 *  to the whole batch -- one append call is one semantic event. */
export function appendLogs(prev: LogEntry[], lines: string | string[], level?: LogLevel): LogEntry[] {
    const incoming = (Array.isArray(lines) ? lines : [lines]).map(text => ({
        id: nextLogId++,
        time: timestamp(),
        text,
        ...(level ? { level } : {})
    }));
    return [...prev, ...incoming].slice(-LOG_CAP);
}
