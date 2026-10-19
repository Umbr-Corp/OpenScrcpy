import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MicMeter from '../MicMeter';

const hoisted = vi.hoisted(() => ({
    handlers: new Map<string, Set<(event: { payload: unknown }) => void>>()
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
        let set = hoisted.handlers.get(name);
        if (!set) {
            set = new Set();
            hoisted.handlers.set(name, set);
        }
        set.add(handler);
        return Promise.resolve(() => set.delete(handler));
    })
}));
vi.mock('../../../tauri', () => ({ isTauri: vi.fn(() => true) }));
vi.mock('../../../i18n', () => ({
    useI18n: () => ({ t: (key: string) => key })
}));

function emit(name: string, payload: unknown) {
    for (const handler of hoisted.handlers.get(name) ?? []) {
        handler({ payload });
    }
}

describe('MicMeter', () => {
    beforeEach(() => {
        hoisted.handlers.clear();
        vi.clearAllMocks();
    });

    it('shows idle copy and no meter while the session is stopped', () => {
        render(<MicMeter sessionRunning={false} />);

        expect(screen.getByText('controlPanel.micDestLabel')).toBeInTheDocument();
        expect(screen.getByText('controlPanel.micDestIdle')).toBeInTheDocument();
        expect(screen.queryByText('controlPanel.micLevelLabel')).not.toBeInTheDocument();
        expect(hoisted.handlers.get('mic-level')).toBeDefined();
    });

    it('live-updates route and level while the bridge runs', () => {
        render(<MicMeter sessionRunning={true} />);

        expect(screen.getByText('controlPanel.micDestSearching')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();

        act(() => emit('mic-route', ['OpenScrcpy virtual mic', true]));
        act(() => emit('mic-level', -12.4));

        expect(screen.getByText('OpenScrcpy virtual mic')).toBeInTheDocument();
        expect(screen.getByText('-12 dB')).toBeInTheDocument();
        // Routed flag ok drops the warning asterisk.
        expect(screen.queryByText(/virtual mic \*/i)).not.toBeInTheDocument();
    });

    it('marks a route that landed outside the virtual sink', () => {
        render(<MicMeter sessionRunning={true} />);

        act(() => emit('mic-route', ['Built-in Audio', false]));

        const sink = screen.getByText((_, el) => el?.textContent === 'Built-in Audio *' && el.tagName === 'SPAN');
        expect(sink).toBeInTheDocument();
    });

    it('clears stale values when the session stops', () => {
        const { rerender } = render(<MicMeter sessionRunning={true} />);

        act(() => emit('mic-route', ['OpenScrcpy virtual mic', true]));
        act(() => emit('mic-level', -5));
        expect(screen.getByText('-5 dB')).toBeInTheDocument();
        expect(screen.getByText('OpenScrcpy virtual mic')).toBeInTheDocument();

        rerender(<MicMeter sessionRunning={false} />);

        expect(screen.getByText('controlPanel.micDestIdle')).toBeInTheDocument();
        expect(screen.queryByText('OpenScrcpy virtual mic')).not.toBeInTheDocument();
        expect(screen.queryByText('controlPanel.micLevelLabel')).not.toBeInTheDocument();
    });
});
