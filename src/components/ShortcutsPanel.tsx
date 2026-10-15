import { Maximize, Home, ChevronLeft, List, Power, RotateCw, Clipboard, MonitorOff, Keyboard } from 'lucide-react';
import { useI18n } from '../i18n';

export default function ShortcutsPanel() {
    const { t } = useI18n();
    const shortcuts = [
        { label: t('shortcuts.full'), key: "F", icon: Maximize },
        { label: t('shortcuts.home'), key: "H", icon: Home },
        { label: t('shortcuts.back'), key: "B", icon: ChevronLeft },
        { label: t('shortcuts.recents'), key: "S", icon: List },
        { label: t('shortcuts.power'), key: "P", icon: Power },
        { label: t('shortcuts.rotate'), key: "R", icon: RotateCw },
        { label: t('shortcuts.paste'), key: "V", icon: Clipboard },
        { label: t('shortcuts.off'), key: "O", icon: MonitorOff },
    ];

    return (
        <div className="ds-card p-3.5 space-y-2">
            <div className="flex items-center gap-2 pb-1.5 mb-1" style={{ borderBottom: '1px solid var(--border-base)' }}>
                <Keyboard size={12} style={{ color: 'var(--text-muted)' }} />
                <h2 className="ds-label" style={{ color: 'var(--text-muted)' }}>{t('shortcuts.title')}</h2>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {shortcuts.map(s => (
                    <div
                        key={s.key}
                        title={s.label}
                        className="ds-inset flex flex-col items-center justify-center p-1.5 cursor-help"
                    >
                        <s.icon size={14} className="mb-1" style={{ color: 'var(--text-muted)' }} />
                        <kbd className="ds-badge">
                            {s.key}
                        </kbd>
                    </div>
                ))}
            </div>
        </div>
    );
}
