import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import ShortcutsPanel from '../ShortcutsPanel.svelte';
import { setLocale } from '../../i18n';

describe('ShortcutsPanel', () => {
    afterEach(async () => {
        await setLocale('en');
    });

    it('re-renders its labels after a locale change', async () => {
        render(ShortcutsPanel);
        expect(screen.getByText('Shortcuts (Alt +)')).toBeInTheDocument();

        await setLocale('pt-BR');
        await tick();

        expect(screen.getByText('Atalhos (Alt +)')).toBeInTheDocument();
    });
});
