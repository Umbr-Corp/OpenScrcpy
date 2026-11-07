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
 * Every locale bundle must resolve, for its own language, the alert and log
 * keys the app shows. A key that lives in the wrong section (e.g. `alerts`)
 * silently resolves to the raw key string at runtime, because `t()` falls
 * back to the key itself when nothing matches.
 *
 * STATIC IMPORTS ON PURPOSE: Vite cannot statically analyse a dynamic import
 * with a variable path, so the bundle list is spelled out explicitly here.
 */
const bundles: Record<string, Record<string, any>> = {
    en, fr, 'pt-BR': ptBR, 'zh-CN': zhCN, 'zh-TW': zhTW, ru, id, ar
};

/** Keys intentionally allowed to fall back to another locale or namespace.
 *  None today: every `alerts.*` and `logs.*` key must exist in all locales. */
const FALLBACK_KEYS = new Set<string>([]);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.svelte'];

// Raw source of every app file under src/, resolved by Vite so the test does
// not need Node typings. Tests, mocks and locale bundles are filtered out.
const sources = import.meta.glob('../**/*.{ts,tsx,svelte}', {
    query: '?raw',
    import: 'default',
    eager: true
}) as Record<string, string>;

function isAppSource(file: string): boolean {
    return !file.includes('/locales/')
        && !file.includes('/__tests__/')
        && !/\.test\.tsx?$/.test(file)
        && SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function alertAndLogKeys(): string[] {
    const pattern = /\bt\(\s*['"`]((?:alerts|logs)\.[A-Za-z0-9_]+)['"`]/g;
    const keys = new Set<string>();

    for (const [file, source] of Object.entries(sources)) {
        if (!isAppSource(file)) continue;
        for (const match of source.matchAll(pattern)) {
            keys.add(match[1]);
        }
    }

    return [...keys].sort();
}

function lookup(bundle: Record<string, any>, key: string): unknown {
    return key.split('.').reduce((node, part) => node?.[part], bundle as any);
}

describe('i18n alert and log keys', () => {
    const keys = alertAndLogKeys().filter((key) => !FALLBACK_KEYS.has(key));

    it('finds the keys used by the app', () => {
        expect(keys.length).toBeGreaterThan(30);
    });

    it('covers every supported locale', () => {
        expect(Object.keys(bundles).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    });

    it.each(SUPPORTED_LOCALES)('locale %s defines every used key', (locale: string) => {
        for (const key of keys) {
            const value = lookup(bundles[locale], key);
            expect(typeof value, `${locale} is missing ${key}`).toBe('string');
            expect((value as string).trim().length, `${locale} has an empty ${key}`).toBeGreaterThan(0);
        }
    });
});
