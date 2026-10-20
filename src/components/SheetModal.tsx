import type { CSSProperties, ReactNode, RefObject } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import Modal from './Modal';
import { useI18n } from '../i18n';

interface SheetModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Visible heading and accessible dialog name. */
    title: string;
    icon?: LucideIcon;
    zIndex?: number;
    backdropStyle?: CSSProperties;
    /** Padding for the fixed overlay. */
    overlayClassName?: string;
    /** Panel width/padding (e.g. "w-full max-w-sm p-6"). */
    panelClassName?: string;
    initialFocusRef?: RefObject<HTMLElement | null>;
    closeOnBackdrop?: boolean;
    /** Action row rendered under the body (typically one full-width button). */
    footer?: ReactNode;
    children: ReactNode;
}

/** Titled content dialog: heading + close X + body + optional footer.
 *
 *  ThemedModal stays the alert/confirm primitive; this is the shell for
 *  informational panels (setup help, about, pairing) that used to repeat the
 *  same header/backdrop markup in three different files.
 */
export default function SheetModal({
    isOpen,
    onClose,
    title,
    icon: Icon,
    zIndex,
    backdropStyle,
    overlayClassName = 'p-6',
    panelClassName = 'w-full max-w-md p-6',
    initialFocusRef,
    closeOnBackdrop,
    footer,
    children
}: SheetModalProps) {
    const { t } = useI18n();

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            label={title}
            zIndex={zIndex}
            backdropStyle={backdropStyle}
            overlayClassName={overlayClassName}
            panelClassName={panelClassName}
            initialFocusRef={initialFocusRef}
            closeOnBackdrop={closeOnBackdrop}
        >
            <div className="flex justify-between items-center gap-3 mb-4">
                <h3 className="ds-label ds-strong flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
                    {Icon && <Icon size={16} />} {title}
                </h3>
                <button
                    onClick={onClose}
                    className="ds-btn ds-btn-tertiary"
                    aria-label={t('common.close')}
                >
                    <X size={16} />
                </button>
            </div>

            {children}

            {footer && <div className="mt-6">{footer}</div>}
        </Modal>
    );
}
