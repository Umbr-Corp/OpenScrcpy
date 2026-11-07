<script lang="ts">
    import type { ConfigFieldSetter, ScrcpyConfig } from '../../lib/types';
    import Select from '../Select.svelte';
    import Tooltip from '../Tooltip.svelte';
    import { t } from '../../i18n';
    import { mapRendererSelection, type RendererOption } from './rendererOptions';
    import ResolutionSelect from './ResolutionSelect.svelte';
    import CodecSelect from './CodecSelect.svelte';
    import FpsSelect from './FpsSelect.svelte';
    import RotationSelect from './RotationSelect.svelte';
    import ToggleRow from './ToggleRow.svelte';

    interface Props {
        config: ScrcpyConfig;
        handleChange: ConfigFieldSetter;
        rendererOptions: RendererOption[];
        showResolution?: boolean;
        showCodec?: boolean;
    }

    let {
        config,
        handleChange,
        rendererOptions,
        showResolution = true,
        showCodec = true
    }: Props = $props();
</script>

<div class="space-y-2">
    <div class="grid {showResolution ? 'grid-cols-3' : 'grid-cols-2'} gap-2">
        {#if showResolution}
            <ResolutionSelect
                value={config.res}
                onChange={(value) => handleChange('res', value)}
            />
        {/if}
        {#if showCodec}
            <CodecSelect value={config.codec} onChange={(value) => handleChange('codec', value)} />
        {/if}
        <FpsSelect value={config.fps} onChange={(value) => handleChange('fps', value)} />
        <RotationSelect
            value={config.rotation}
            onChange={(value) => handleChange('rotation', value)}
        />
        <Select
            label={t('controlPanel.graphicsRenderer')}
            value={config.renderDriver || 'auto'}
            onChange={(value) => handleChange('renderDriver', mapRendererSelection(value))}
            options={rendererOptions}
            triggerClassName="cp-select"
            optionClassName="cp-opt"
            customLabel={t('controlPanel.custom')}
        />
    </div>
    <div class="grid grid-cols-2 gap-3">
        <Tooltip text={t('controlPanel.vsyncTooltip')} block>
            <ToggleRow
                checked={config.vsync !== false}
                onChange={(value) => handleChange('vsync', value)}
                label={t('controlPanel.vsync')}
                hint={t('controlPanel.vsyncHint')}
            />
        </Tooltip>
        <Tooltip text={t('controlPanel.ignoreEncoderConstraintsTooltip')} block>
            <ToggleRow
                checked={!!config.ignoreVideoEncoderConstraints}
                onChange={(value) => handleChange('ignoreVideoEncoderConstraints', value)}
                label={t('controlPanel.ignoreEncoderConstraints')}
                hint="v4.1"
            />
        </Tooltip>
    </div>
</div>
