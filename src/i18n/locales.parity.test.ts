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
 * Every locale bundle must resolve every key the app can show. A key that
 * lives in the wrong section silently resolves to the raw key string at
 * runtime, because `t()` falls back to the key itself when nothing matches.
 *
 * STATIC IMPORTS ON PURPOSE: Vite cannot statically analyse a dynamic import
 * with a variable path, so the bundle list is spelled out explicitly here.
 */
const bundles: Record<string, Record<string, unknown>> = {
    en, fr, 'pt-BR': ptBR, 'zh-CN': zhCN, 'zh-TW': zhTW, ru, id, ar
};

/** Keys reached through variables rather than a literal `t('...')` call. */
const DYNAMIC_KEYS = [
    'common.kindWarning',
    'common.kindError',
    'common.kindInfo',
    'common.kindSuccess',
    'controlPanel.screen',
    'controlPanel.camera',
    'controlPanel.desktop',
    'controlPanel.microphone',
    'header.colorModes.light',
    'header.colorModes.dark',
    'header.colorModes.system',
    'sessionBehavior.audioCodecAuto',
    'sessionBehavior.audioCodecOpus',
    'sessionBehavior.audioCodecAac',
    'sessionBehavior.audioCodecFlac',
    'sessionBehavior.audioCodecRaw'
];

/** Keys intentionally allowed to fall back to another locale or namespace.
 *  None today: every key must exist in all locales. */
const FALLBACK_KEYS = new Set<string>([]);

// Raw source of every app file under src/, resolved by Vite so the test does
// not need Node typings. Tests, mocks and locale bundles are filtered out.
const sources = import.meta.glob('../**/*.{ts,svelte}', {
    query: '?raw',
    import: 'default',
    eager: true
}) as Record<string, string>;

function isAppSource(file: string): boolean {
    return !file.includes('/locales/')
        && !file.includes('/__tests__/')
        && !/\.test\.tsx?$/.test(file);
}

function staticKeys(): string[] {
    const pattern = /\bt\(\s*['"`]([A-Za-z0-9_.]+)['"`]/g;
    const keys = new Set<string>();

    for (const [file, source] of Object.entries(sources)) {
        if (!isAppSource(file)) continue;
        for (const match of source.matchAll(pattern)) {
            keys.add(match[1]);
        }
    }

    return [...keys].sort();
}

type Bundle = Record<string, unknown>;

function flatten(bundle: Bundle, prefix = ''): Map<string, unknown> {
    const out = new Map<string, unknown>();

    for (const [key, value] of Object.entries(bundle)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [nestedKey, nestedValue] of flatten(value as Bundle, path)) {
                out.set(nestedKey, nestedValue);
            }
        } else {
            out.set(path, value);
        }
    }

    return out;
}

function lookup(bundle: Bundle, key: string): unknown {
    return key.split('.').reduce<unknown>(
        (node, part) => (node as Bundle | undefined)?.[part],
        bundle
    );
}

function placeholders(value: string): string[] {
    return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('i18n locale parity', () => {
    const keys = [...new Set([...staticKeys(), ...DYNAMIC_KEYS])].filter(
        (key) => !FALLBACK_KEYS.has(key)
    );
    const englishKeys = flatten(en as unknown as Bundle);

    it('finds the keys used by the app', () => {
        expect(keys.length).toBeGreaterThan(100);
    });

    it('covers every supported locale', () => {
        expect(Object.keys(bundles).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    });

    it.each(SUPPORTED_LOCALES)('locale %s defines every used key', (locale: string) => {
        const bundle = bundles[locale];

        for (const key of keys) {
            const value = lookup(bundle, key);
            expect(typeof value, `${locale} is missing ${key}`).toBe('string');
            expect((value as string).trim().length, `${locale} has an empty ${key}`).toBeGreaterThan(0);
        }
    });

    it.each(SUPPORTED_LOCALES)('locale %s keeps the full English key tree', (locale: string) => {
        const bundle = flatten(bundles[locale]);

        for (const [key, value] of englishKeys) {
            if (typeof value !== 'string') continue;
            const translated = bundle.get(key);
            expect(typeof translated, `${locale} is missing ${key}`).toBe('string');
            expect((translated as string).trim().length, `${locale} has an empty ${key}`).toBeGreaterThan(0);
        }
    });

    it.each(SUPPORTED_LOCALES)('locale %s preserves template placeholders', (locale: string) => {
        const bundle = flatten(bundles[locale]);

        for (const [key, value] of englishKeys) {
            if (typeof value !== 'string') continue;
            const translated = bundle.get(key);
            if (typeof translated !== 'string') continue;

            expect(
                placeholders(translated),
                `${locale} changes placeholders in ${key}`
            ).toEqual(placeholders(value));
        }
    });
});
