import { useSyncExternalStore } from 'react';
import ThemedModal from './ThemedModal';
import { closeAlert, getAlertSnapshot, subscribeAlert } from '../alerts';

/** Single mount point for the app-wide alert dialog.
 *
 *  The alert state lives in a module store (`src/alerts.ts`) instead of App:
 *  download progress calls showAlert ~100 times, and with the state in App
 *  every tick re-rendered the whole workspace. Subscribing here keeps those
 *  updates inside this subtree.
 */
export default function AlertHost() {
    const alert = useSyncExternalStore(subscribeAlert, getAlertSnapshot);

    return (
        <ThemedModal
            isOpen={alert.isOpen}
            onClose={closeAlert}
            title={alert.title}
            message={alert.message}
            kind={alert.kind}
            actionLabel={alert.actionLabel}
            onAction={alert.onAction}
            secondaryLabel={alert.secondaryLabel}
            onSecondary={alert.onSecondary}
            showCancel={alert.showCancel}
            cancelLabel={alert.cancelLabel}
            onCancel={alert.onCancel}
            progress={alert.progress}
            progressDetail={alert.progressDetail}
            eyebrow={alert.eyebrow}
            icon={alert.icon}
        />
    );
}
