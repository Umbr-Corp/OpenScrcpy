import { describe, expect, it } from 'vitest';
import { isMdnsDeviceConnected } from '../types';

const dev = {
    name: 'adb-123-abc',
    service: '_adb-tls-connect._tcp',
    address: '192.168.0.5:5555',
};

describe('isMdnsDeviceConnected', () => {
    it('matches the address and the exact mDNS serials', () => {
        expect(isMdnsDeviceConnected(dev, ['192.168.0.5:5555'])).toBe(true);
        expect(isMdnsDeviceConnected(dev, ['adb-123-abc._adb-tls-connect._tcp'])).toBe(true);
        expect(isMdnsDeviceConnected(dev, ['adb-123-abc._adb-tls-connect._tcp (2)'])).toBe(true);
        expect(isMdnsDeviceConnected(dev, ['adb-123-abc._adb-tls-connect._udp'])).toBe(true);
    });

    it('rejects prefix lookalikes and unrelated serials', () => {
        expect(isMdnsDeviceConnected(dev, ['adb-123-abcdef._adb-tls-connect._tcp'])).toBe(false);
        expect(isMdnsDeviceConnected(dev, ['adb-123-abc-extra._adb-tls-connect._tcp'])).toBe(false);
        expect(isMdnsDeviceConnected(dev, ['adb-999-zzz._adb-tls-connect._tcp'])).toBe(false);
    });
});
