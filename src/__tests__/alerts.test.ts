import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAlert, getAlertSnapshot, showAlert, subscribeAlert } from '../alerts';

describe('alert store', () => {
    beforeEach(() => {
        closeAlert();
    });

    it('opens with the given options and notifies subscribers', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeAlert(listener);

        showAlert({ title: 'Title', message: 'Body', kind: 'success' });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(getAlertSnapshot()).toMatchObject({
            isOpen: true,
            title: 'Title',
            message: 'Body',
            kind: 'success'
        });
        unsubscribe();
    });

    it('keeps a stable snapshot between updates', () => {
        showAlert({ title: 'Title', message: 'Body' });
        const first = getAlertSnapshot();
        expect(getAlertSnapshot()).toBe(first);

        showAlert({ title: 'Title', message: 'Body', progress: 42 });
        expect(getAlertSnapshot()).not.toBe(first);
        expect(getAlertSnapshot().progress).toBe(42);
    });

    it('closes once and ignores repeated closes', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeAlert(listener);

        showAlert({ title: 'Title', message: 'Body' });
        closeAlert();
        closeAlert();

        expect(listener).toHaveBeenCalledTimes(2);
        expect(getAlertSnapshot().isOpen).toBe(false);
        unsubscribe();
    });
});
