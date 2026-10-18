import { useState } from 'react';
import { appendLogs, LogEntry } from '../../logs';

/** The shared terminal log stream. Every subsystem (device discovery, mirror
 *  sessions, downloads, terminal commands) appends through `addLogs` so there
 *  is exactly one append path and one retention cap. */
export function useLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLogs = (lines: string | string[]) => {
        setLogs(prev => appendLogs(prev, lines));
    };

    const clearLogs = () => setLogs([]);

    return { logs, setLogs, addLogs, clearLogs };
}
