import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
    value: string | number;
    label: string;
}

interface SelectProps {
    value: string | number | undefined;
    onChange: (val: any) => void;
    options: SelectOption[];
    /** Visible label rendered above the trigger. */
    label?: string;
    /** Extra classes for the trigger button (e.g. "cp-select", "sb-select"). */
    triggerClassName?: string;
    /** Extra classes for each option row (e.g. "cp-opt", "sb-opt"). */
    optionClassName?: string;
    /** Label shown when `value` matches no option (e.g. a saved value the UI no longer offers). */
    customLabel?: string;
    /** Accessible name for the trigger when no visible label is rendered. */
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
}

/** Shared dropdown used by the ControlPanel and SessionBehavior forms.
 *
 *  Defined at module scope on purpose: a dropdown component declared inside
 *  its parent's body gets a new component type on every parent render, which
 *  remounts it and resets its internal open state -- an open dropdown would
 *  close itself on every background device poll.
 *
 *  Full listbox pattern: focus stays on the trigger (aria-activedescendant
 *  tracks the highlighted option), ArrowUp/Down/Home/End navigate, Enter or
 *  Space commits, Escape and Tab close, outside click closes. */
export default function Select({
    value,
    onChange,
    options,
    label,
    triggerClassName = '',
    optionClassName = '',
    customLabel,
    ariaLabel,
    disabled = false,
    className = ''
}: SelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listboxId = useId();

    const selectedIndex = options.findIndex(opt => opt.value === value);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
    const triggerLabel = selectedOption?.label ?? customLabel ?? String(value ?? '');
    const optionId = (index: number) => `${listboxId}-opt-${index}`;

    const open = () => {
        if (disabled) return;
        setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
    };

    const select = (index: number) => {
        const opt = options[index];
        if (!opt) return;
        onChange(opt.value);
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    const moveHighlight = (delta: 1 | -1) => {
        setHighlighted(prev => {
            if (options.length === 0) return prev;
            return (prev + delta + options.length) % options.length;
        });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Keep the highlighted option visible while arrowing through a long list.
    useEffect(() => {
        if (!isOpen || highlighted < 0) return;
        const el = document.getElementById(optionId(highlighted));
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }, [isOpen, highlighted, options.length]);

    const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (isOpen) {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
            }
            return;
        }
        if (e.key === 'Tab') {
            if (isOpen) setIsOpen(false);
            return;
        }
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                moveHighlight(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                moveHighlight(-1);
                break;
            case 'Home':
                e.preventDefault();
                setHighlighted(0);
                break;
            case 'End':
                e.preventDefault();
                setHighlighted(Math.max(0, options.length - 1));
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                select(highlighted);
                break;
        }
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && <span className="ds-label block" style={{ marginBottom: 4 }}>{label}</span>}
            <button
                type="button"
                ref={triggerRef}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-activedescendant={isOpen ? optionId(highlighted) : undefined}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                onKeyDown={handleTriggerKeyDown}
                className={`ds-select-btn ${triggerClassName} w-full flex items-center justify-between gap-2`}
            >
                <span className="truncate">{triggerLabel}</span>
                <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.09s ease-out' }} />
            </button>

            {isOpen && (
                <div
                    role="listbox"
                    id={listboxId}
                    aria-label={ariaLabel ?? label}
                    className="ds-panel ds-fade-in absolute left-0 right-0 z-[100] py-1"
                    style={{ marginTop: 4, padding: 4 }}
                >
                    {options.map((opt, index) => (
                        <div
                            key={opt.value}
                            id={optionId(index)}
                            role="option"
                            aria-selected={opt.value === value}
                            onMouseEnter={() => setHighlighted(index)}
                            onClick={() => select(index)}
                            className={`ds-btn-tertiary ${optionClassName} w-full cursor-pointer`}
                            style={{
                                justifyContent: 'flex-start',
                                ...(index === highlighted && opt.value !== value ? { background: 'var(--bg-input)' } : {}),
                                ...(opt.value === value ? { color: 'var(--primary)' } : {})
                            }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
