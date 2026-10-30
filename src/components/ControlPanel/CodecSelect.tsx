import Select from '../Select';
import { useI18n } from '../../i18n';

interface CodecSelectProps {
    value: string | undefined;
    onChange: (value: string) => void;
}

export default function CodecSelect({ value, onChange }: CodecSelectProps) {
    const { t } = useI18n();

    return (
        <Select
            label={t('controlPanel.codec')}
            value={value || 'h264'}
            onChange={onChange}
            options={[
                { value: 'h264', label: 'H.264' },
                { value: 'h265', label: 'H.265' },
                { value: 'av1', label: 'AV1' },
            ]}
            triggerClassName="cp-select"
            optionClassName="cp-opt"
            customLabel={t('controlPanel.custom')}
        />
    );
}
