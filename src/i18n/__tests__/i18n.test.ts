import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { i18n, setLocale, t } from '../index';

describe('i18n', () => {
    beforeEach(async () => {
        await setLocale('en');
    });

    afterEach(async () => {
        await setLocale('en');
    });

    it('translates from the English base', () => {
        expect(t('controlPanel.microphone')).toBe('Microphone');
    });

    it('loads a non-English locale on demand', async () => {
        await setLocale('pt-BR');

        expect(i18n.locale).toBe('pt-BR');
        expect(t('controlPanel.micBridgeTitle')).toBe('Ponte de Microfone');
    });

    it('keeps the last requested locale when loads race', async () => {
        await Promise.all([setLocale('fr'), setLocale('pt-BR')]);

        expect(i18n.locale).toBe('pt-BR');
        expect(t('controlPanel.micBridgeTitle')).toBe('Ponte de Microfone');
    });

    it('falls back to the key when it does not exist', () => {
        expect(t('missing.key')).toBe('missing.key');
    });

    it('formats placeholders', () => {
        expect(t('header.updateBadge', { v: '2.1.0' })).toContain('2.1.0');
    });
});
