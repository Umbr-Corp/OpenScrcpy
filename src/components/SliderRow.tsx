import { useEffect, useState } from 'react';
import Tooltip from './Tooltip';

interface SliderRowProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Formats the numeric readout shown next to the label (e.g. "8M", "1.5x", "420 DPI"). */
    format?: (v: number) => string;
    /** Optional help tooltip rendered after the label. */
    tooltip?: string;
    /** Commits the value on release (mouse up, touch end, key up), not per pixel. */
    onChange: (v: number) => void;
}

/** Shared slider row with commit-on-release. The draft lives in local state
 *  so dragging never writes the persisted config (and localStorage) once per
 *  pixel; the parent only hears about it when the user lets go or nudges with
 *  the keyboard. Replaces the four separate slider implementations. */
export default function SliderRow({ label, value, min, max, step = 1, format = (v) => String(v), tooltip, onChange }: SliderRowProps) {
    const [localValue, setLocalValue] = useState(value);

    // Sync from parent when the value changes externally (e.g. preset load).
    useEffect(() => setLocalValue(value), [value]);

    const commit = () => onChange(localValue);

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                    <span className="ds-label">{label}</span>
                    {tooltip && <Tooltip text={tooltip} />}
                </div>
                <span className="ds-caption tabular-nums" style={{ color: 'var(--primary)' }}>{format(localValue)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={localValue}
                aria-label={label}
                onChange={(e) => setLocalValue(parseFloat(e.target.value))}
                onMouseUp={commit}
                onTouchEnd={commit}
                onKeyUp={commit}
                className="ds-range w-full"
            />
        </div>
    );
}
