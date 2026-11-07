<script lang="ts">
    import Select from '../Select.svelte';
    import { t } from '../../i18n';

    interface Props {
        value: number | undefined;
        onChange: (value: number | undefined) => void;
    }
    let { value, onChange }: Props = $props();
</script>

<Select
    label={t('controlPanel.fps')}
    value={value ?? 0}
    onChange={(next) => onChange(next === 0 ? undefined : next)}
    options={[
        { value: 0, label: t('controlPanel.rendererAuto') || 'Automatic' },
        { value: 30, label: '30' },
        { value: 60, label: '60' },
        { value: 90, label: '90' },
        { value: 120, label: '120' }
    ]}
    triggerClassName="cp-select"
    optionClassName="cp-opt"
    customLabel={t('controlPanel.custom')}
/>
