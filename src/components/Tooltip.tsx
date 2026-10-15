import React, { useState } from 'react';

interface TooltipProps {
    text: string;
    children?: React.ReactNode;
    placement?: 'top' | 'bottom';
}

export default function Tooltip({ text, children, placement = 'top' }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div
            className="relative inline-flex items-center"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            <span className="ds-link cursor-help">
                {children || "(?)"}
            </span>

            {isVisible && (
                <div className={`ds-panel absolute left-1/2 -translate-x-1/2 w-48 p-2 shadow-lg z-[100] text-center ds-fade-in ${placement === 'top'
                        ? 'bottom-full mb-2'
                        : 'top-full mt-2'
                    }`}>
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
