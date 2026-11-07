export const WINDOW_DRAG_EXCLUDE =
    'button, a, input, select, textarea, [role="dialog"], [role="listbox"], [data-nodrag]';

export type ResizeDir =
    | 'East'
    | 'North'
    | 'NorthEast'
    | 'NorthWest'
    | 'South'
    | 'SouthEast'
    | 'SouthWest'
    | 'West';

export function edgeStyle(direction: ResizeDir): string {
    const base = 'position: fixed; pointer-events: auto; z-index: 80; touch-action: none;';
    switch (direction) {
        case 'North':
            return `${base} cursor: ns-resize; top: 0; left: 14px; right: 14px; height: 6px;`;
        case 'South':
            return `${base} cursor: ns-resize; bottom: 0; left: 14px; right: 14px; height: 6px;`;
        case 'West':
            return `${base} cursor: ew-resize; left: 0; top: 14px; bottom: 14px; width: 6px;`;
        case 'East':
            return `${base} cursor: ew-resize; right: 0; top: 14px; bottom: 14px; width: 6px;`;
        case 'NorthWest':
            return `${base} cursor: nw-resize; top: 0; left: 0; width: 16px; height: 16px;`;
        case 'NorthEast':
            return `${base} cursor: ne-resize; top: 0; right: 0; width: 16px; height: 16px;`;
        case 'SouthWest':
            return `${base} cursor: sw-resize; bottom: 0; left: 0; width: 16px; height: 16px;`;
        case 'SouthEast':
            return `${base} cursor: se-resize; bottom: 0; right: 0; width: 16px; height: 16px;`;
    }
}
