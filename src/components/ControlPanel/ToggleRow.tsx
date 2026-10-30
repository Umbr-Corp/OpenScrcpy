import type { LucideIcon } from 'lucide-react';

interface ToggleRowProps {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    hint?: string;
    icon?: LucideIcon;
}

// Single settings toggle row: label on the left, .ds-toggle on the right.
// Keyboard accessible (role="switch"); hover uses the primary border token.
export default function ToggleRow({ checked, onChange, label, hint, icon: Icon }: ToggleRowProps) {
    return (
        <div
            role="switch"
            aria-checked={checked}
            tabIndex={0}
            onClick={() => onChange(!checked)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(!checked);
                }
            }}
            className="cp-row flex items-center justify-between gap-3 cursor-pointer px-3 py-2"
        >
            <div className="flex items-center gap-2 min-w-0">
                {Icon && (
                    <span style={{ color: checked ? 'var(--primary)' : 'var(--text-muted)' }} className="flex items-center shrink-0">
                        <Icon size={12} />
                    </span>
                )}
                <div className="min-w-0">
                    <span className="ds-label truncate block">{label}</span>
                    {hint && (
                        <span className="block ds-caption truncate" style={{ color: 'var(--text-muted)', fontSize: 10.5, lineHeight: '13px' }}>{hint}</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="ds-toggle" data-on={checked ? 'true' : 'false'} aria-hidden="true">
                    <span />
                </span>
            </div>
        </div>
    );
}
