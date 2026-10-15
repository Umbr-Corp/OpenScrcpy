import { useRef, useEffect, useState, memo } from 'react';
import { Terminal, Trash2, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '../i18n';

interface LogPanelProps {
    logs: string[];
    onClear: () => void;
    onAddLog?: (msg: string) => void;
    onRunCommand?: (cmd: string) => void;
}

const LogPanel = memo(({ logs, onClear, onAddLog, onRunCommand }: LogPanelProps) => {
    const { t } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const [isLive, setIsLive] = useState(false);
    const [command, setCommand] = useState("");

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
        if (logs.length > 0) {
            setIsLive(true);
            const timer = setTimeout(() => setIsLive(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [logs.length]); // Only trigger scroll on length change

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && command.trim()) {
            onRunCommand?.(command.trim());
            setCommand("");
        }
    };

    return (
        <div
            className="force-dark rounded-lg h-[220px] flex-none overflow-hidden font-mono flex flex-col relative"
            style={{ border: '1px solid #5C5C5C' }}
        >
            {/* Scoped dark overrides for shared controls inside the terminal surface */}
            <style>{`
                .force-dark .ds-btn-tertiary { color: #FAFAFA; }
                .force-dark .ds-btn-tertiary:hover { background: #5C5C5C; color: #FAFAFA; }
                .force-dark .ds-btn-tertiary:disabled { opacity: 0.45; }
                .force-dark .ds-input::placeholder { color: #AEAEAE; }
            `}</style>
            {/* Top Bar */}
            <div className="px-4 py-2.5 flex justify-between items-center shrink-0" style={{ borderBottom: '1px solid #5C5C5C' }}>
                <div className="flex items-center gap-3">
                    <Terminal size={12} style={{ color: 'var(--primary)' }} />
                    <div className="flex items-center gap-2">
                        <span className="ds-label" style={{ color: '#AEAEAE' }}>{t('logPanel.systemConsole')}</span>
                        <span className="ds-dot" data-live={isLive} />
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={async () => {
                            const storageData: Record<string, string> = {};
                            for (let i = 0; i < localStorage.length; i++) {
                                const key = localStorage.key(i);
                                if (key) storageData[key] = localStorage.getItem(key) || "";
                            }

                            const data = {
                                timestamp: new Date().toISOString(),
                                localStorage: storageData,
                                logs: logs
                            };

                            try {
                                const fileName = `openscrcpy-logs-${Date.now()}.json`;
                                await invoke('save_report', {
                                    content: JSON.stringify(data, null, 2),
                                    name: fileName
                                });
                                if (onAddLog) {
                                    onAddLog(t('logPanel.diagnosticReportSaved', { fileName }));
                                } else {
                                    alert(t('logPanel.reportSavedAlert', { fileName }));
                                }
                            } catch (e) {
                                console.error("Export failed:", e);
                            }
                        }}
                        className="ds-btn ds-btn-tertiary"
                        title={t('logPanel.reportTitle')}
                    >
                        <Download size={10} />
                        {t('logPanel.report')}
                    </button>
                    <button
                        onClick={onClear}
                        className="ds-btn ds-btn-tertiary"
                    >
                        <Trash2 size={10} />
                        {t('logPanel.clear')}
                    </button>
                </div>
            </div>

            {/* Terminal Body */}
            <div ref={containerRef} className="flex-1 overflow-y-auto p-4 pt-2">
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <span className="ds-caption" style={{ color: '#AEAEAE' }}>{t('logPanel.waitingForSequence')}</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-3 leading-relaxed py-0.5 pl-3" style={{ borderLeft: '1px solid #5C5C5C', fontSize: '11px' }}>
                                <span className="shrink-0 tabular-nums" style={{ color: '#AEAEAE' }}>
                                    {new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className="break-all" style={{ color: '#FAFAFA' }}>{log}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Terminal Input */}
            <div className="px-4 py-2 flex items-center gap-2 shrink-0" style={{ borderTop: '1px solid #5C5C5C' }}>
                <label htmlFor="log-terminal-input" className="select-none" style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 700 }}>$</label>
                <input
                    id="log-terminal-input"
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('logPanel.terminalPlaceholder')}
                    className="ds-input flex-1 font-mono"
                    style={{ background: 'transparent', borderColor: 'transparent', color: '#FAFAFA', fontSize: '11px' }}
                />
            </div>
        </div>
    );
});

export default LogPanel;
