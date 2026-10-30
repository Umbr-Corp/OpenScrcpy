import Select from '../Select';
import { useI18n } from '../../i18n';

interface RotationSelectProps {
    value: string | undefined;
    onChange: (value: string) => void;
}

export default function RotationSelect({ value, onChange }: RotationSelectProps) {
    const { t } = useI18n();

    return (
        <Select
            label={t('controlPanel.rotation')}
            value={value || '0'}
            onChange={onChange}
            options={[
                { value: '0', label: '0°' },
                { value: '270', label: '-90°' },
                { value: '90', label: '+90°' },
                { value: '180', label: '180°' },
            ]}
            triggerClassName="cp-select"
            optionClassName="cp-opt"
            customLabel={t('controlPanel.custom')}
        />
    );
}
