import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Accessible dialog name (aria-label). */
    label?: string;
    labelledById?: string;
    /** Id of the element that describes the dialog (message body). */
    describedById?: string;
    /** z-index of the fixed overlay (the app stacks modals at 100/200/300). */
    zIndex?: number;
    /** Backdrop scrim; defaults to the rgba style shared by the app modals. */
    backdropStyle?: React.CSSProperties;
    /** Padding for the fixed overlay (e.g. "p-4", "p-6"). */
    overlayClassName?: string;
    /** Extra classes for the ds-card panel. */
    panelClassName?: string;
    panelStyle?: React.CSSProperties;
    /** Element focused when the dialog opens; defaults to the first focusable inside. */
    initialFocusRef?: React.RefObject<HTMLElement | null>;
    /** Whether clicking the backdrop dismisses the dialog. Default true. */
    closeOnBackdrop?: boolean;
    /** Whether Escape dismisses the dialog. Default true. */
    closeOnEscape?: boolean;
    children: React.ReactNode;
}

/** Shared dialog shell used by every modal in the app (ThemedModal,
 *  OnboardingModal, the pairing dialog and the Header popovers' dialogs).
 *
 *  Handles the parts every hand-rolled modal got subtly wrong on its own:
 *  Escape to close, a Tab focus trap that cannot escape the dialog, focus
 *  restoration on close, and a backdrop that actually receives the outside
 *  click (clicking on the absolute-positioned backdrop used to bubble with
 *  e.target != e.currentTarget, so the "close on backdrop" checks never
 *  fired). Visual composition stays with the caller via the panel props. */
export default function Modal({
    isOpen,
    onClose,
    label,
    labelledById,
    describedById,
    zIndex = 300,
    backdropStyle,
    overlayClassName = '',
    panelClassName = '',
    panelStyle,
    initialFocusRef,
    closeOnBackdrop = true,
    closeOnEscape = true,
    children
}: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        // Callers can mark the intended landing spot with data-autofocus;
        // otherwise fall back to the first focusable (usually the close X).
        const target =
            initialFocusRef?.current ??
            dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
            dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
            dialogRef.current;
        target?.focus();
        return () => {
            previouslyFocused?.focus?.();
        };
    }, [isOpen, initialFocusRef]);

    if (!isOpen) return null;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (closeOnEscape) onClose();
            return;
        }
        if (e.key !== 'Tab') return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <div
            className={`fixed inset-0 flex items-center justify-center ${overlayClassName}`}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            aria-labelledby={labelledById}
            aria-describedby={describedById}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            ref={dialogRef}
            style={{ zIndex, outline: 'none' }}
        >
            {/* Backdrop: covers the overlay behind the panel, so a click here
                is by definition an outside click. */}
            <div
                className="absolute inset-0"
                style={backdropStyle ?? { background: 'rgba(0, 0, 0, 0.4)' }}
                onClick={closeOnBackdrop ? onClose : undefined}
            />

            <div className={`ds-card relative shadow-xl ds-fade-in ${panelClassName}`} style={panelStyle}>
                {children}
            </div>
        </div>
    );
}
