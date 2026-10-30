import { ConfigFieldSetter, ScrcpyConfig } from '../../hooks/useScrcpy';
import Select from '../Select';
import Tooltip from '../Tooltip';
import { useI18n } from '../../i18n';
import { mapRendererSelection, type RendererOption } from './rendererOptions';
import ResolutionSelect from './ResolutionSelect';
import CodecSelect from './CodecSelect';
import FpsSelect from './FpsSelect';
import RotationSelect from './RotationSelect';
import ToggleRow from './ToggleRow';

interface PerformanceGridProps {
    config: ScrcpyConfig;
    handleChange: ConfigFieldSetter;
    rendererOptions: RendererOption[];
    showResolution?: boolean;
    showCodec?: boolean;
}

// Resolution / codec / fps / rotation / renderer grid, shared by the three
// session modes with selective hiding.
export default function PerformanceGrid({
    config,
    handleChange,
    rendererOptions,
    showResolution = true,
    showCodec = true
}: PerformanceGridProps) {
    const { t } = useI18n();

    return (
        <div className="space-y-2">
            <div className={`grid ${showResolution ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                {showResolution && (
                    <ResolutionSelect
                        value={config.res}
                        onChange={(value) => handleChange('res', value)}
                    />
                )}
                {showCodec && (
                    <CodecSelect
                        value={config.codec}
                        onChange={(value) => handleChange('codec', value)}
                    />
                )}
                <FpsSelect
                    value={config.fps}
                    onChange={(value) => handleChange('fps', value)}
                />
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
            <div className="grid grid-cols-2 gap-3">
                <Tooltip text={t('controlPanel.vsyncTooltip')} block>
                    <ToggleRow
                        checked={config.vsync !== false}
                        onChange={(value) => handleChange('vsync', value)}
                        label={t('controlPanel.vsync')}
                        hint={t('controlPanel.vsyncHint')}
                    />
                </Tooltip>
                {/* v4.1: ignore encoder constraints */}
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
    );
}
