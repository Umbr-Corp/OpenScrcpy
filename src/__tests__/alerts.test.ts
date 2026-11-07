import { beforeEach, describe, expect, it } from 'vitest';
import { alert, closeAlert, showAlert } from '../lib/alerts.svelte';

describe('alert store', () => {
    beforeEach(() => {
        closeAlert();
    });

    it('opens with the given options', () => {
        showAlert({ title: 'Title', message: 'Body', kind: 'success' });

        expect(alert.isOpen).toBe(true);
        expect(alert.title).toBe('Title');
        expect(alert.message).toBe('Body');
        expect(alert.kind).toBe('success');
    });

    it('replaces the current alert options', () => {
        showAlert({ title: 'Title', message: 'Body' });
        showAlert({ title: 'Title', message: 'Body', progress: 42 });

        expect(alert.progress).toBe(42);
    });

    it('closes and clears the alert', () => {
        showAlert({ title: 'Title', message: 'Body' });
        closeAlert();

        expect(alert.isOpen).toBe(false);
        expect(alert.title).toBe('');
    });

    it('does not leak optional fields from the previous alert', () => {
        showAlert({
            title: 'Download',
            message: '42%',
            progress: 42,
            progressDetail: '12/28 MB',
            eyebrow: 'v1 → v2'
        });

        showAlert({ title: 'Done', message: 'Finished' });

        expect(alert.progress).toBeUndefined();
        expect(alert.progressDetail).toBeUndefined();
        expect(alert.eyebrow).toBeUndefined();
    });
});
