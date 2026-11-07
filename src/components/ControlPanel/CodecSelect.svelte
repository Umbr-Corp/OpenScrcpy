<script lang="ts">
    import Select from '../Select.svelte';
    import { t } from '../../i18n';

    interface Props {
        value: string | undefined;
        onChange: (value: string) => void;
    }
    let { value, onChange }: Props = $props();
</script>

<Select
    label={t('controlPanel.codec')}
    value={value || 'h264'}
    {onChange}
    options={[
        { value: 'h264', label: 'H.264' },
        { value: 'h265', label: 'H.265' },
        { value: 'av1', label: 'AV1' }
    ]}
    triggerClassName="cp-select"
    optionClassName="cp-opt"
    customLabel={t('controlPanel.custom')}
/>
