import { X, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import React from 'react';

type ModalKind = 'warning' | 'error' | 'info' | 'success';

interface ThemedModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    kind?: ModalKind;
    actionLabel?: string;
    onAction?: () => void;
    showCancel?: boolean;
    cancelLabel?: string;
    onCancel?: () => void;
}

// Kind is signalled by border style (solid vs dashed) + a text label, never
// by a new hue: icons stay in primary / muted only.
const KIND_ICON = {
    warning: AlertTriangle,
    error: AlertCircle,
    info: Info,
    success: CheckCircle2,
} as const;

const KIND_LABEL: Record<ModalKind, string> = {
    warning: 'Warning',
    error: 'Error',
    info: 'Info',
    success: 'Success',
};

const DASHED_KINDS: ReadonlySet<ModalKind> = new Set(['warning', 'error']);

export default function ThemedModal({
    isOpen,
    onClose,
    title,
    message,
    kind = 'info',
    actionLabel = 'OK',
    onAction,
    showCancel = false,
    cancelLabel = 'Cancel',
    onCancel
}: ThemedModalProps) {
    if (!isOpen) return null;

    const Icon = KIND_ICON[kind];
    const dashed = DASHED_KINDS.has(kind);
    const borderStyle = dashed ? { borderStyle: 'dashed' as const } : undefined;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-6"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            {/* Backdrop */}
            <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.4)' }}></div>

            {/* Modal Container */}
            <div
                className="ds-card relative w-full max-w-md overflow-hidden flex flex-col shadow-xl ds-fade-in"
                style={borderStyle}
            >
                {/* Close Button */}
                <div className="absolute top-4 right-4 z-10">
                    <button
                        onClick={onClose}
                        aria-label={cancelLabel}
                        className="ds-btn ds-btn-tertiary"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 pb-6 flex flex-col items-center text-center pt-12">
                    {/* Icon */}
                    <div className="ds-inset w-16 h-16 rounded-md flex items-center justify-center mb-6" style={borderStyle}>
                        <Icon size={32} style={{ color: 'var(--primary)' }} />
                    </div>

                    {/* Kind label: text + border style carry the meaning, not color */}
                    <span className="ds-badge mb-3" style={borderStyle}>
                        {KIND_LABEL[kind]}
                    </span>

                    {/* Content */}
                    <h3 className="ds-body ds-strong mb-3">
                        {title}
                    </h3>
                    <p className="ds-caption max-w-[280px]" style={{ color: 'var(--text-muted)' }}>
                        {message}
                    </p>
                </div>

                {/* Footer Actions */}
                <div className="p-4 pt-0 flex gap-3">
                    {showCancel && (
                        <button
                            onClick={() => {
                                if (onCancel) onCancel();
                                onClose();
                            }}
                            className="ds-btn ds-btn-secondary flex-1"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (onAction) onAction();
                            onClose();
                        }}
                        className={showCancel ? 'ds-btn ds-btn-primary flex-1' : 'ds-btn ds-btn-primary w-full'}
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
