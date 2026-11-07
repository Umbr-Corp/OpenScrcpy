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
    label={t('controlPanel.rotation')}
    value={value || '0'}
    {onChange}
    options={[
        { value: '0', label: '0°' },
        { value: '270', label: '-90°' },
        { value: '90', label: '+90°' },
        { value: '180', label: '180°' }
    ]}
    triggerClassName="cp-select"
    optionClassName="cp-opt"
    customLabel={t('controlPanel.custom')}
/>
