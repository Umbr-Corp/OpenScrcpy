import { en, type Translations } from './locales/en';
import { safeGetItem, safeSetItem } from '../lib/storage';

export type Locale = 'en' | 'fr' | 'pt-BR' | 'zh-CN' | 'zh-TW' | 'ru' | 'id' | 'ar';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'fr', 'pt-BR', 'zh-CN', 'zh-TW', 'ru', 'id', 'ar'];

const STORAGE_KEY = 'scrcpy_locale';

type Primitive = string | number | boolean;
type Loader = () => Promise<Translations>;

const loaders: Record<Exclude<Locale, 'en'>, Loader> = {
    fr: () => import('./locales/fr').then(m => m.fr),
    'pt-BR': () => import('./locales/pt-BR').then(m => m.ptBR),
    'zh-CN': () => import('./locales/zh-CN').then(m => m.zhCN),
    'zh-TW': () => import('./locales/zh-TW').then(m => m.zhTW),
    ru: () => import('./locales/ru').then(m => m.ru),
    id: () => import('./locales/id').then(m => m.id),
    ar: () => import('./locales/ar').then(m => m.ar)
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
    if (!isPlainObject(base) || !isPlainObject(override)) {
        return override === undefined || override === null ? base : (override as T);
    }
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        const baseVal = Object.prototype.hasOwnProperty.call(base, key)
            ? (base as Record<string, unknown>)[key]
            : undefined;
        const overrideVal = Object.prototype.hasOwnProperty.call(override, key)
            ? (override as Record<string, unknown>)[key]
            : undefined;
        if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
            result[key] = deepMerge(baseVal, overrideVal);
        } else if (overrideVal === undefined || overrideVal === null || overrideVal === '') {
            result[key] = baseVal;
        } else {
            result[key] = overrideVal;
        }
    }
    return result as T;
}

function detectInitialLocale(): Locale {
    const stored = safeGetItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
        return stored as Locale;
    }

    const navigatorLanguages: string[] = [];
    if (typeof navigator !== 'undefined') {
        if (Array.isArray(navigator.languages)) navigatorLanguages.push(...navigator.languages);
        if (navigator.language) navigatorLanguages.push(navigator.language);
    }

    for (const raw of navigatorLanguages) {
        if (!raw) continue;
        const lower = raw.toLowerCase();
        if (lower === 'zh-tw' || lower.startsWith('zh-tw')) return 'zh-TW';
        if (lower === 'zh-hk' || lower.startsWith('zh-hk')) return 'zh-TW';
        if (lower === 'zh-mo' || lower.startsWith('zh-mo')) return 'zh-TW';
        if (lower === 'zh-hant' || lower.startsWith('zh-hant')) return 'zh-TW';
        if (lower === 'zh-cn' || lower.startsWith('zh-cn')) return 'zh-CN';
        if (lower === 'zh-sg' || lower.startsWith('zh-sg')) return 'zh-CN';
        if (lower === 'zh-hans' || lower.startsWith('zh-hans')) return 'zh-CN';
        if (lower.startsWith('zh')) return 'zh-CN';
        if (lower === 'pt-br' || lower.startsWith('pt-br')) return 'pt-BR';
        if (lower.startsWith('pt')) return 'pt-BR';
        if (lower.startsWith('ru')) return 'ru';
        if (lower.startsWith('fr')) return 'fr';
        if (lower.startsWith('id')) return 'id';
        if (lower.startsWith('ar')) return 'ar';
        if (lower.startsWith('en')) return 'en';
    }

    return 'en';
}

function resolveByPath(source: unknown, path: string): unknown {
    if (!path) return source;
    const segments = path.split('.');
    let current: unknown = source;
    for (const segment of segments) {
        if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
            return undefined;
        }
        if (isPlainObject(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
            current = (current as Record<string, unknown>)[segment];
        } else {
            return undefined;
        }
    }
    return current;
}

function formatTemplate(template: string, vars?: Record<string, Primitive>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return match;
        }
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
            const value = vars[key];
            return value === undefined || value === null ? match : String(value);
        }
        return match;
    });
}

export interface I18nState {
    locale: Locale;
    translations: Translations;
    loading: boolean;
}

export const i18n = $state<I18nState>({
    locale: detectInitialLocale(),
    translations: en,
    loading: false
});

function applyDocumentLocale(locale: Locale) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

export function t(key: string, vars?: Record<string, Primitive>): string {
    const localized = resolveByPath(i18n.translations, key);
    if (typeof localized === 'string') {
        return formatTemplate(localized, vars);
    }
    const fallback = resolveByPath(en, key);
    if (typeof fallback === 'string') {
        return formatTemplate(fallback, vars);
    }
    return key;
}

export async function setLocale(next: Locale): Promise<void> {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    i18n.locale = next;
    safeSetItem(STORAGE_KEY, next);
    applyDocumentLocale(next);

    if (next === 'en') {
        i18n.translations = en;
        i18n.loading = false;
        return;
    }

    i18n.loading = true;
    try {
        const bundle = await loaders[next]();
        i18n.translations = deepMerge(en, bundle);
    } catch (e) {
        console.error(`Failed to load locale ${next}`, e);
        i18n.translations = en;
    } finally {
        i18n.loading = false;
    }
}

/** Load the initial locale before mounting, so a saved non-English locale
 *  does not flash English on every start. */
export async function initI18n(): Promise<void> {
    applyDocumentLocale(i18n.locale);
    if (i18n.locale !== 'en') {
        await setLocale(i18n.locale);
    }
}
