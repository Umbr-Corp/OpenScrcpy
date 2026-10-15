import React, { ErrorInfo, ReactNode } from "react";
import { AlertCircle, Download, RefreshCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { I18nContext } from "../i18n";
import { en } from "../i18n/locales/en";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
    static contextType = I18nContext;
    declare context: React.ContextType<typeof I18nContext>;

    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private translate = (key: string, vars?: Record<string, string | number | boolean>): string => {
        if (this.context && typeof this.context.t === 'function') {
            return this.context.t(key, vars);
        }
        // Manual fallback to English when context is unavailable.
        const segments = key.split('.');
        let cursor: unknown = en;
        for (const segment of segments) {
            if (cursor && typeof cursor === 'object' && segment in (cursor as Record<string, unknown>)) {
                cursor = (cursor as Record<string, unknown>)[segment];
            } else {
                return key;
            }
        }
        if (typeof cursor !== 'string') return key;
        if (!vars) return cursor;
        return cursor.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    };

    private handleExportDiagnostics = async () => {
        const storageData: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) storageData[key] = localStorage.getItem(key) || "";
        }

        const diagnostics = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            localStorage: storageData,
            error: this.state.error?.message || "Unknown error",
            stack: this.state.error?.stack || "No stack trace available",
        };

        try {
            const fileName = `scrcpy-gui-diagnostics-${Date.now()}.json`;
            await invoke('save_report', {
                content: JSON.stringify(diagnostics, null, 2),
                name: fileName
            });
            alert(this.translate('errorBoundary.diagnosticSavedAlert', { fileName }));
        } catch (e) {
            console.error("Export failed:", e);
        }
    };

    public render() {
        if (this.state.hasError) {
            const t = this.translate;
            return (
                <div className="min-h-screen flex items-center justify-center p-6 font-sans" style={{ background: 'var(--bg-base)', color: 'var(--text-base)' }}>
                    {/* Dashed border + text label mark the error kind; no new hue. */}
                    <div className="ds-card max-w-md w-full p-8 space-y-6 text-center shadow-xl" style={{ borderStyle: 'dashed' }}>
                        <div className="ds-inset inline-flex p-4 rounded-md mb-2" style={{ borderStyle: 'dashed' }}>
                            <AlertCircle size={40} style={{ color: 'var(--primary)' }} />
                        </div>

                        <div className="space-y-2">
                            <span className="ds-badge" style={{ borderStyle: 'dashed' }}>{t('errorBoundary.errorSignature')}</span>
                            <h1 className="ds-body ds-strong">{t('errorBoundary.title')}</h1>
                            <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('errorBoundary.subtitle')}</p>
                        </div>

                        <div className="ds-inset rounded-md p-4 text-left overflow-hidden">
                            <p className="ds-caption font-mono break-all" style={{ color: 'var(--text-base)' }}>
                                {this.state.error?.message || t('errorBoundary.criticalSystemFailure')}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="ds-btn ds-btn-secondary"
                            >
                                <RefreshCcw size={14} />
                                {t('errorBoundary.reboot')}
                            </button>
                            <button
                                onClick={this.handleExportDiagnostics}
                                className="ds-btn ds-btn-primary"
                            >
                                <Download size={14} />
                                {t('errorBoundary.exportLogs')}
                            </button>
                        </div>

                        <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('errorBoundary.recoveryEngine')}</p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
