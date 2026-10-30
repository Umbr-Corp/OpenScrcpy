import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PerformanceGrid from '../PerformanceGrid';
import { ScrcpyConfig } from '../../../hooks/useScrcpy';

const config: ScrcpyConfig = {
    device: 'device-1',
    sessionMode: 'mirror',
    res: '0',
    codec: 'h264',
    fps: 60,
    rotation: '0',
    vsync: true
};

const rendererOptions = [
    { value: 'auto', label: 'Automatic' },
    { value: 'opengl', label: 'OpenGL' }
];

function renderGrid(overrides: Partial<ScrcpyConfig> = {}, handleChange = vi.fn()) {
    render(
        <PerformanceGrid
            config={{ ...config, ...overrides }}
            handleChange={handleChange}
            rendererOptions={rendererOptions}
        />
    );
    return handleChange;
}

async function openSelect(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
    const container = screen.getByText(label).parentElement as HTMLElement;
    await user.click(container.querySelector('button') as HTMLButtonElement);
}

describe('PerformanceGrid', () => {
    it('renders the resolution, codec, fps, rotation and renderer blocks', () => {
        renderGrid();

        expect(screen.getByText(/resolution/i)).toBeInTheDocument();
        expect(screen.getByText(/codec/i)).toBeInTheDocument();
        expect(screen.getByText(/frame rate/i)).toBeInTheDocument();
        expect(screen.getByText(/rotation/i)).toBeInTheDocument();
        expect(screen.getByText(/graphics renderer/i)).toBeInTheDocument();
    });

    it('reports a resolution change', async () => {
        const user = userEvent.setup();
        const handleChange = renderGrid();

        await openSelect(user, /resolution/i);
        await user.click(screen.getByText('720p'));

        expect(handleChange).toHaveBeenCalledWith('res', '1280');
    });

    it('reports fps changes and clears the value on automatic', async () => {
        const user = userEvent.setup();
        const handleChange = renderGrid();

        await openSelect(user, /frame rate/i);
        await user.click(screen.getByText('30'));

        expect(handleChange).toHaveBeenCalledWith('fps', 30);
    });

    it('reports the vsync toggle', async () => {
        const user = userEvent.setup();
        const handleChange = renderGrid();

        await user.click(screen.getAllByRole('switch')[0]);

        expect(handleChange).toHaveBeenCalledWith('vsync', false);
    });

    it('hides the resolution block when the mode has its own size fields', () => {
        render(
            <PerformanceGrid
                config={config}
                handleChange={vi.fn()}
                rendererOptions={rendererOptions}
                showResolution={false}
            />
        );

        expect(screen.queryByText(/^resolution$/i)).not.toBeInTheDocument();
    });
});
