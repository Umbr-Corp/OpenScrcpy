import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import MicMeter from '../MicMeter.svelte';
import { setLocale } from '../../../i18n';

const mockListen = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));

describe('MicMeter', () => {
    beforeAll(() => {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });

    afterAll(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    beforeEach(async () => {
        await setLocale('en');
        mockListen.mockReset();
    });

    it('shows the routed destination and the live level', async () => {
        const handlers = new Map<string, (event: { payload: unknown }) => void>();
        mockListen.mockImplementation((event: string, handler: (event: { payload: unknown }) => void) => {
            handlers.set(event, handler);
            return Promise.resolve(() => {});
        });

        render(MicMeter, { props: { sessionRunning: true } });
        await tick();

        handlers.get('mic-route')?.({ payload: ['OpenScrcpy Mic', true] });
        handlers.get('mic-level')?.({ payload: -12.4 });
        await tick();

        expect(screen.getByText('OpenScrcpy Mic')).toBeInTheDocument();
        expect(screen.getByText('-12 dB')).toBeInTheDocument();
    });

    it('clears the level when the session stops', async () => {
        const handlers = new Map<string, (event: { payload: unknown }) => void>();
        mockListen.mockImplementation((event: string, handler: (event: { payload: unknown }) => void) => {
            handlers.set(event, handler);
            return Promise.resolve(() => {});
        });

        const view = render(MicMeter, { props: { sessionRunning: true } });
        await tick();
        handlers.get('mic-level')?.({ payload: -5 });
        await tick();
        expect(screen.getByText('-5 dB')).toBeInTheDocument();

        await view.rerender({ sessionRunning: false });
        await tick();

        expect(screen.queryByText('-5 dB')).not.toBeInTheDocument();
        expect(screen.getByText('idle')).toBeInTheDocument();
    });
});
