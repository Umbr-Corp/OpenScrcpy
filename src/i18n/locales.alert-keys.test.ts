import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './index';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { ptBR } from './locales/pt-BR';
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';
import { ru } from './locales/ru';
import { id } from './locales/id';
import { ar } from './locales/ar';

/**
 * Every locale bundle must resolve, for its own language, the alert keys the
 * app shows through the `alerts.*` namespace. A key that lives in the wrong
 * section (e.g. `logs`) silently resolves to the raw key string at runtime,
 * because `t()` falls back to the key itself when nothing matches.
 *
 * STATIC IMPORTS ON PURPOSE: Vite cannot statically analyse a dynamic import
 * with a variable path, so the bundle list is spelled out explicitly here.
 */
const bundles: Record<string, Record<string, any>> = {
    en, fr, 'pt-BR': ptBR, 'zh-CN': zhCN, 'zh-TW': zhTW, ru, id, ar
};

describe('i18n alert keys', () => {
    it('covers every supported locale', () => {
        expect(Object.keys(bundles).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    });

    it.each(SUPPORTED_LOCALES)(
        'locale %s defines a non-empty alerts.noDeviceForListOptions',
        (locale: string) => {
            const value = bundles[locale]?.alerts?.noDeviceForListOptions;
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        }
    );
});
