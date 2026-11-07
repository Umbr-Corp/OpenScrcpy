/** Shared log ring used by the terminal panel. */

export type LogLevel = 'system' | 'warn' | 'err' | 'ok';

export interface LogEntry {
    id: number;
    time: string;
    text: string;
    level?: LogLevel;
}

export const LOG_CAP = 100;

let nextLogId = 1;

function timestamp(): string {
    return new Date().toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function appendLogs(
    prev: LogEntry[],
    lines: string | string[],
    level?: LogLevel
): LogEntry[] {
    const incoming = (Array.isArray(lines) ? lines : [lines]).map(text => ({
        id: nextLogId++,
        time: timestamp(),
        text,
        ...(level ? { level } : {})
    }));
    return [...prev, ...incoming].slice(-LOG_CAP);
}

export function resetLogIds() {
    nextLogId = 1;
}
