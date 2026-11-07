<script lang="ts">
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { isTauri } from '../lib/tauri';
    import { edgeStyle, type ResizeDir } from './windowChrome';

    const DIRECTIONS: ResizeDir[] = [
        'North',
        'South',
        'West',
        'East',
        'NorthWest',
        'NorthEast',
        'SouthWest',
        'SouthEast'
    ];

    async function startResize(e: MouseEvent, dir: ResizeDir) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            await getCurrentWindow().startResizeDragging(dir);
        } catch {
            // preview mode / unsupported compositor
        }
    }
</script>

{#if isTauri()}
    <div aria-hidden="true">
        {#each DIRECTIONS as dir (dir)}
            <div role="presentation" style={edgeStyle(dir)} onmousedown={(e) => startResize(e, dir)}></div>
        {/each}
    </div>
{/if}
