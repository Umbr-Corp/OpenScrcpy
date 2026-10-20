interface ProgressBarProps {
    /** 0-100. Clamped so a bad backend value cannot break the layout/ARIA. */
    value: number;
    /** Accessible name for the bar. */
    label: string;
    /** dialog = alert modal, card = onboarding, compact = header popover. */
    variant?: 'dialog' | 'card' | 'compact';
    /** Bytes/percent caption under the bar. */
    detail?: string;
    className?: string;
}

const TRACK: Record<NonNullable<ProgressBarProps['variant']>, string> = {
    dialog: 'ds-inset h-2.5 rounded-sm',
    card: 'ds-inset h-2 rounded-full',
    compact: 'h-1 rounded-full',
};

const FILL: Record<NonNullable<ProgressBarProps['variant']>, string> = {
    dialog: 'rounded-sm',
    card: 'rounded-full',
    compact: 'rounded-full',
};

export default function ProgressBar({
    value,
    label,
    variant = 'dialog',
    detail,
    className
}: ProgressBarProps) {
    const safe = Math.min(100, Math.max(0, Math.round(value)));

    return (
        <div className={className}>
            <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={safe}
                className={`w-full overflow-hidden ${TRACK[variant]}`}
                style={variant === 'compact' ? { backgroundColor: 'var(--bg-input)' } : undefined}
            >
                <div
                    className={`h-full ${FILL[variant]}`}
                    style={{
                        width: `${safe}%`,
                        background: 'var(--primary)',
                        transition: 'width 150ms linear'
                    }}
                />
            </div>
            {detail && (
                <div className="ds-caption mt-2" style={{ color: 'var(--text-muted)' }}>
                    {detail}
                </div>
            )}
        </div>
    );
}
