import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '../../i18n';
import { isTauri } from '../../tauri';

/** Live mic-bridge status for the mic panel: where the audio stream
 *  currently lands (virtual-sink routing, Linux) and the level bar. The
 *  events only flow while the Rust sidecar bridge is running; state clears
 *  when the session stops.
 *
 *  This component owns the subscription so a 4x/s mic-level burst re-renders
 *  just these two rows instead of the whole App tree (frontend audit P2-8).
 *  The backend re-emits the route every watcher pass as a heartbeat, so a
 *  remount (user away on another tab while the bridge runs) catches up on
 *  the next pass instead of staying without destination info. */
export default function MicMeter({ sessionRunning }: { sessionRunning: boolean }) {
    const { t } = useI18n();
    const [level, setLevel] = useState<number | null>(null);
    const [route, setRoute] = useState<{ sink: string; ok: boolean } | null>(null);

    useEffect(() => {
        if (sessionRunning) return;
        // Events stop flowing when the bridge stops, so without the reset the
        // rows would freeze showing the last tick forever.
        setLevel(null);
        setRoute(null);
    }, [sessionRunning]);

    useEffect(() => {
        if (!isTauri()) return;
        const unlistenLevel = listen<number>('mic-level', (event) => {
            const db = event.payload;
            setLevel(typeof db === 'number' && Number.isFinite(db) ? Math.round(db) : null);
        });
        const unlistenRoute = listen<[string, boolean]>('mic-route', (event) => {
            const [sink, ok] = event.payload;
            setRoute({ sink, ok });
        });
        return () => {
            unlistenLevel.then(f => f());
            unlistenRoute.then(f => f());
        };
    }, []);

    return (
        <>
            <div className="flex items-center justify-between">
                <span className="ds-label">{t('controlPanel.micDestLabel')}</span>
                {!sessionRunning ? (
                    <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('controlPanel.micDestIdle')}</span>
                ) : !route?.sink ? (
                    <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('controlPanel.micDestSearching')}</span>
                ) : (
                    <span
                        className="ds-caption ds-strong"
                        style={{ color: route.ok ? 'var(--success, var(--primary))' : 'var(--warning, var(--secondary))' }}
                        title={route.sink}
                    >
                        {route.sink}{route.ok ? '' : ' *'}
                    </span>
                )}
            </div>

            {sessionRunning && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="ds-label">{t('controlPanel.micLevelLabel')}</span>
                        <span className="ds-caption font-mono" style={{ color: 'var(--text-muted)' }}>
                            {typeof level === 'number' ? `${level} dB` : '—'}
                        </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-inset, rgba(0,0,0,0.25))', overflow: 'hidden' }}>
                        <div
                            style={{
                                height: '100%',
                                width: `${typeof level === 'number' ? Math.max(0, Math.min(100, ((level + 60) / 60) * 100)) : 0}%`,
                                background: 'var(--primary)',
                                transition: 'width 120ms linear'
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
