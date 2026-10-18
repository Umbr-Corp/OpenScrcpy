import React, { useId, useState } from 'react';

interface TooltipProps {
    text: string;
    children?: React.ReactNode;
    placement?: 'top' | 'bottom';
    /** Full-width block row (for wrapping row-like children such as
     *  toggles). Default inline keeps the "(?)" marker beside labels. */
    block?: boolean;
}

/** Hover tooltip, now also keyboard-reachable. When used standalone (the "(?)"
 *  marker) the wrapper takes a tab stop so keyboard users can open it; when it
 *  wraps a control the wrapper's focus handler still fires (React onFocus/onBlur
 *  bubble), so focusing the wrapped toggle reveals the tooltip too. Escape
 *  dismisses. */
export default function Tooltip({ text, children, placement = 'top', block = false }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const tooltipId = useId();

    return (
        <div
            className={block ? "relative block w-full" : "relative inline-flex items-center"}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            onFocus={() => setIsVisible(true)}
            onBlur={() => setIsVisible(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setIsVisible(false); }}
        >
            <span
                tabIndex={children ? undefined : 0}
                aria-describedby={isVisible ? tooltipId : undefined}
                style={{ color: 'inherit', cursor: children ? undefined : 'help', display: block ? 'block' : undefined, width: block ? '100%' : undefined }}
            >
                {children || <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>(?)</span>}
            </span>

            {isVisible && (
                <div
                    id={tooltipId}
                    role="tooltip"
                    className={`ds-panel absolute left-1/2 -translate-x-1/2 w-48 p-2 shadow-lg z-[100] text-center ds-fade-in ${placement === 'top'
                            ? 'bottom-full mb-2'
                            : 'top-full mt-2'
                        }`}
                >
                    <p className="ds-caption" style={{ color: 'var(--text-base)' }}>{text}</p>
                    {/* Arrow */}
                    <div
                        className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${placement === 'top'
                                ? 'top-full -mt-1'
                                : 'bottom-full -mb-1'
                            }`}
                        style={placement === 'top'
                            ? { borderTopColor: 'var(--border-base)' }
                            : { borderBottomColor: 'var(--border-base)' }}
                    ></div>
                </div>
            )}
        </div>
    );
}
