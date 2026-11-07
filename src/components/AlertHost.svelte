<script lang="ts">
    import ThemedModal from './ThemedModal.svelte';
    import { alert, closeAlert } from '../lib/alerts.svelte';
</script>

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
