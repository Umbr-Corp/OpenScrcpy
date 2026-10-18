import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../tauri';
import { useI18n } from '../i18n';

/** Same values as Tauri's internal ResizeDirection union (it is not exported
 *  from @tauri-apps/api/window). */
type ResizeDir = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

/** Interactive elements that must never start a window drag or win a
 *  resize-vs-click race. Shared by the header drag handler and the grips. */
export const WINDOW_DRAG_EXCLUDE = 'button, a, input, select, textarea, [role="dialog"], [role="listbox"], [data-nodrag]';

function edgeStyle(direction: ResizeDir): CSSProperties {
    const base: CSSProperties = { position: 'fixed', pointerEvents: 'auto', zIndex: 80, touchAction: 'none' };
    switch (direction) {
        case 'North':     return { ...base, cursor: 'ns-resize', top: 0, left: 14, right: 14, height: 6 };
        case 'South':     return { ...base, cursor: 'ns-resize', bottom: 0, left: 14, right: 14, height: 6 };
        case 'West':      return { ...base, cursor: 'ew-resize', left: 0, top: 14, bottom: 14, width: 6 };
        case 'East':      return { ...base, cursor: 'ew-resize', right: 0, top: 14, bottom: 14, width: 6 };
        case 'NorthWest': return { ...base, cursor: 'nw-resize', top: 0, left: 0, width: 16, height: 16 };
        case 'NorthEast': return { ...base, cursor: 'ne-resize', top: 0, right: 0, width: 16, height: 16 };
        case 'SouthWest': return { ...base, cursor: 'sw-resize', bottom: 0, left: 0, width: 16, height: 16 };
        case 'SouthEast': return { ...base, cursor: 'se-resize', bottom: 0, right: 0, width: 16, height: 16 };
    }
}

const DIRECTIONS: ResizeDir[] = ['North', 'South', 'West', 'East', 'NorthWest', 'NorthEast', 'SouthWest', 'SouthEast'];

/** Invisible resize grips along the window borders, for the Linux custom
 *  titlebar mode: with `decorations(false)` the compositor no longer owns
 *  the titlebar (and, critically, its interactive resize edges), so the app
 *  provides them. The grips sit above normal content (z-80) but below every
 *  modal (z-100+) and only cover a few pixels of each border. */
export function WindowResizeEdges() {
    if (!isTauri()) return null;
    return (
        <div aria-hidden="true">
            {DIRECTIONS.map(dir => (
                <div
                    key={dir}
                    style={edgeStyle(dir)}
                    onMouseDown={(e: ReactMouseEvent) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        getCurrentWindow().startResizeDragging(dir).catch(() => { });
                    }}
                />
            ))}
        </div>
    );
}

const BTN: CSSProperties = {
    width: 46, display: 'grid', placeItems: 'center', alignSelf: 'stretch',
    border: 0, background: 'transparent', color: 'var(--text-muted)',
    cursor: 'default', padding: 0, transition: 'background 0.12s, color 0.12s'
};

const svgProps = { width: 15, height: 15, strokeWidth: 2.2, fill: 'none', stroke: 'currentColor' } as const;

/** The – / ▢ / ✕ trio for the Linux custom titlebar, rendered by the Header.
 *  Hidden outside the Tauri WebView (the plain-web preview keeps its current
 *  look). The maximize button tracks the real window state via the resize
 *  event stream, so compositor-side snapping and shortcuts update it too. */
export function WindowButtons() {
    const { t } = useI18n();
    const [maximized, setMaximized] = useState(false);

    useEffect(() => {
        if (!isTauri()) return;
        const win = getCurrentWindow();
        let unlisten: (() => void) | undefined;
        win.isMaximized().then(setMaximized).catch(() => { });
        win.onResized(() => {
            win.isMaximized().then(setMaximized).catch(() => { });
        }).then(fn => { unlisten = fn; }).catch(() => { });
        return () => unlisten?.();
    }, []);

    return (
        <div
            className="flex items-stretch flex-shrink-0"
            style={{ margin: '-8px -16px -8px 8px' }}
            aria-label="window controls"
        >
            <button
                className="win-chrome-btn"
                style={BTN}
                aria-label={t('common.winMinimize')}
                title={t('common.winMinimize')}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => getCurrentWindow().minimize().catch(() => { })}
            >
                <svg {...svgProps} viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
            </button>
            <button
                className="win-chrome-btn"
                style={BTN}
                aria-label={maximized ? t('common.winRestore') : t('common.winMaximize')}
                title={maximized ? t('common.winRestore') : t('common.winMaximize')}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => getCurrentWindow().toggleMaximize().catch(() => { })}
            >
                {maximized ? (
                    <svg {...svgProps} viewBox="0 0 24 24">
                        <rect x="8" y="8" width="11" height="11" rx="1.5" />
                        <path d="M5 15V6.5C5 5.7 5.7 5 6.5 5H15" />
                    </svg>
                ) : (
                    <svg {...svgProps} viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>
                )}
            </button>
            <button
                className="win-chrome-btn win-chrome-close"
                style={BTN}
                aria-label={t('common.winClose')}
                title={t('common.winClose')}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => getCurrentWindow().close().catch(() => { })}
            >
                <svg {...svgProps} viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
        </div>
    );
}
