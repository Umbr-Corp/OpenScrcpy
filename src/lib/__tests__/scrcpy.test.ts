import { beforeEach, describe, expect, it } from 'vitest';
import { scrcpy, DEFAULT_CONFIG } from '../scrcpy.svelte';

describe('scrcpy store', () => {
    beforeEach(() => {
        scrcpy.config = { ...DEFAULT_CONFIG };
        scrcpy.logs = [];
        scrcpy.devices = [];
        scrcpy.activeDevice = '';
        scrcpy.historyDevices = [];
        scrcpy.runningDevices = [];
    });

    it('merges config patches', () => {
        scrcpy.updateConfig({ bitrate: 12, sessionMode: 'camera' });

        expect(scrcpy.config.bitrate).toBe(12);
        expect(scrcpy.config.sessionMode).toBe('camera');
    });

    it('keeps the selected device in the config', () => {
        scrcpy.setActiveDevice('device1');

        expect(scrcpy.activeDevice).toBe('device1');
        expect(scrcpy.config.device).toBe('device1');
    });

    it('derives sessionRunning from the active device', () => {
        scrcpy.setActiveDevice('device1');
        scrcpy.runningDevices = ['device1', 'device2'];

        expect(scrcpy.sessionRunning).toBe(true);

        scrcpy.runningDevices = ['device2'];
        expect(scrcpy.sessionRunning).toBe(false);
    });

    it('caps the log ring at 100 entries', () => {
        for (let i = 0; i < 105; i++) scrcpy.addLogs(`line ${i}`);

        expect(scrcpy.logs).toHaveLength(100);
        expect(scrcpy.logs[99].text).toBe('line 104');
    });

    it('deduplicates and caps recent devices', () => {
        for (let i = 0; i < 12; i++) scrcpy.addToHistory(`192.168.0.${i}:5555`);
        scrcpy.addToHistory('192.168.0.5:5555');

        expect(scrcpy.historyDevices).toHaveLength(10);
        expect(scrcpy.historyDevices[0]).toBe('192.168.0.5:5555');
        expect(new Set(scrcpy.historyDevices).size).toBe(10);
    });
});
