import Select from '../Select';
import { useI18n } from '../../i18n';

interface ResolutionSelectProps {
    value: string | undefined;
    onChange: (value: string) => void;
}

export default function ResolutionSelect({ value, onChange }: ResolutionSelectProps) {
    const { t } = useI18n();

    return (
        <Select
            label={t('controlPanel.resolution')}
            value={value || '0'}
            onChange={onChange}
            options={[
                { value: '0', label: t('controlPanel.resolutionOriginal') },
                { value: '3840', label: '4K' },
                { value: '2560', label: '2K' },
                { value: '1920', label: '1080p' },
                { value: '1600', label: '900p' },
                { value: '1280', label: '720p' },
                { value: '1024', label: '576p' },
                { value: '800', label: '480p' },
            ]}
            triggerClassName="cp-select"
            optionClassName="cp-opt"
            customLabel={t('controlPanel.custom')}
        />
    );
}
