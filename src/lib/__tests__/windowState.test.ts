import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { setupMainWindowState } from '../windowState';

const mockWindow = vi.hoisted(() => ({
    isMaximized: vi.fn(() => Promise.resolve(false)),
    outerSize: vi.fn(() => Promise.resolve(new PhysicalSize(1200, 890))),
    outerPosition: vi.fn(() => Promise.resolve(new PhysicalPosition(0, 0))),
    setSize: vi.fn(() => Promise.resolve()),
    setPosition: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    onResized: vi.fn(() => Promise.resolve(() => {})),
    onMoved: vi.fn(() => Promise.resolve(() => {}))
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => mockWindow
}));

describe('main window state', () => {
    beforeEach(() => {
        localStorage.clear();
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        Object.values(mockWindow).forEach(fn => fn.mockClear());
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    it('restores the saved size and position', async () => {
        localStorage.setItem(
            'openscrcpy_window_state',
            JSON.stringify({ width: 1300, height: 900, x: 40, y: 60, maximized: false })
        );

        const cleanup = setupMainWindowState();

        await vi.waitFor(() => expect(mockWindow.setSize).toHaveBeenCalled());
        expect(mockWindow.setSize).toHaveBeenCalledWith(new PhysicalSize(1300, 900));
        expect(mockWindow.setPosition).toHaveBeenCalledWith(new PhysicalPosition(40, 60));
        expect(mockWindow.maximize).not.toHaveBeenCalled();

        cleanup();
    });

    it('migrates the legacy misspelled key', async () => {
        localStorage.setItem(
            'opensrcpy_window_state',
            JSON.stringify({ width: 1300, height: 900, x: 40, y: 60, maximized: false })
        );

        const cleanup = setupMainWindowState();

        await vi.waitFor(() => expect(mockWindow.setSize).toHaveBeenCalled());
        expect(localStorage.getItem('openscrcpy_window_state')).not.toBeNull();
        expect(localStorage.getItem('opensrcpy_window_state')).toBeNull();

        cleanup();
    });

    it('ignores invalid saved geometry', async () => {
        localStorage.setItem(
            'openscrcpy_window_state',
            JSON.stringify({ width: 10, height: 10, x: 0, y: 0, maximized: false })
        );

        const cleanup = setupMainWindowState();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockWindow.setSize).not.toHaveBeenCalled();
        cleanup();
    });
});
