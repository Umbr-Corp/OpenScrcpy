import { X, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import { useI18n } from '../i18n';

type ModalKind = 'warning' | 'error' | 'info' | 'success';

interface ThemedModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    kind?: ModalKind;
    actionLabel?: string;
    onAction?: () => void;
    // Optional second command shown between the cancel and the primary
    // button (e.g. the quieter path in an update dialog).
    secondaryLabel?: string;
    onSecondary?: () => void;
    showCancel?: boolean;
    cancelLabel?: string;
    onCancel?: () => void;
    // Download screen: deterministic bar + a bytes caption. When set, the
    // action footer goes away (buttons mean nothing mid-download).
    progress?: number;
    progressDetail?: string;
}

// Kind is signalled by border style (solid vs dashed) + a text label, never
// by a new hue: icons stay in primary / muted only.
const KIND_ICON = {
    warning: AlertTriangle,
    error: AlertCircle,
    info: Info,
    success: CheckCircle2,
} as const;

const DASHED_KINDS: ReadonlySet<ModalKind> = new Set(['warning', 'error']);

export default function ThemedModal({
    isOpen,
    onClose,
    title,
    message,
    kind = 'info',
    actionLabel,
    onAction,
    secondaryLabel,
    onSecondary,
    showCancel = false,
    cancelLabel,
    onCancel,
    progress,
    progressDetail
}: ThemedModalProps) {
    const { t } = useI18n();

    if (!isOpen) return null;

    const resolvedActionLabel = actionLabel ?? t('common.ok');
    const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
    const Icon = KIND_ICON[kind];
    const dashed = DASHED_KINDS.has(kind);
    const borderStyle = dashed ? { borderStyle: 'dashed' as const } : undefined;
    const isProgress = typeof progress === 'number';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            label={title}
            overlayClassName="p-6"
            panelClassName="w-full max-w-md overflow-hidden flex flex-col"
            panelStyle={borderStyle}
        >
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-10">
                <button
                    onClick={onClose}
                    aria-label={resolvedCancelLabel}
                    className="ds-btn ds-btn-tertiary"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="p-8 pb-6 flex flex-col items-center text-center pt-12">
                {/* Icon */}
                <div className="ds-inset w-16 h-16 rounded-md flex items-center justify-center mb-6" style={borderStyle}>
                    {Icon && <Icon size={32} style={{ color: 'var(--primary)' }} />}
                </div>

                {/* Kind label: text + border style carry the meaning, not color */}
                <span className="ds-badge mb-3" style={borderStyle}>
                    {t(`common.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)}
                </span>

                {/* Content */}
                <h3 className="ds-body ds-strong mb-3">
                    {title}
                </h3>
                <p className="ds-caption max-w-[280px] whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>
                    {message}
                </p>

                {/* Determinate download bar; the text message carries the
                    percent for screen readers, the bar for everyone else. */}
                {isProgress && (
                    <div className="mt-5 w-full max-w-[280px]">
                        <div
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                            className="ds-inset h-2.5 w-full overflow-hidden rounded-sm"
                        >
                            <div
                                className="h-full rounded-sm"
                                style={{ width: `${progress}%`, background: 'var(--primary)', transition: 'width 150ms linear' }}
                            />
                        </div>
                        {progressDetail && (
                            <div className="ds-caption mt-2" style={{ color: 'var(--text-muted)' }}>
                                {progressDetail}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            {!isProgress && (
            <div className="p-4 pt-0 flex gap-3">
                {showCancel && (
                    <button
                        onClick={() => {
                            if (onCancel) onCancel();
                            onClose();
                        }}
                        className="ds-btn ds-btn-secondary flex-1"
                    >
                        {resolvedCancelLabel}
                    </button>
                )}
                {secondaryLabel && (
                    <button
                        onClick={() => {
                            if (onSecondary) onSecondary();
                            onClose();
                        }}
                        className="ds-btn ds-btn-tertiary"
                    >
                        {secondaryLabel}
                    </button>
                )}
                <button
                    onClick={() => {
                        if (onAction) onAction();
                        onClose();
                    }}
                    className={showCancel ? 'ds-btn ds-btn-primary flex-1' : 'ds-btn ds-btn-primary w-full'}
                >
                    {resolvedActionLabel}
                </button>
            </div>
            )}
        </Modal>
    );
}
