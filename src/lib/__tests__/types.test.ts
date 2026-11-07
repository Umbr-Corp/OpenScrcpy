import { describe, expect, it } from 'vitest';
import { isMdnsDeviceConnected, mdnsHostIp } from '../types';

describe('mDNS helpers', () => {
    const device = {
        name: 'adb-Phone',
        service: '_adb-tls-connect._tcp',
        address: '192.168.0.5:5555'
    };

    it('matches a device connected by plain address', () => {
        expect(isMdnsDeviceConnected(device, ['192.168.0.5:5555'])).toBe(true);
    });

    it('matches an mDNS transport serial', () => {
        expect(
            isMdnsDeviceConnected(device, ['adb-Phone._adb-tls-connect._tcp'])
        ).toBe(true);
    });

    it('does not match a different host', () => {
        expect(isMdnsDeviceConnected(device, ['192.168.0.6:5555'])).toBe(false);
    });

    it('extracts the host from IPv4 and bracketed IPv6 addresses', () => {
        expect(mdnsHostIp('192.168.0.5:5555')).toBe('192.168.0.5');
        expect(mdnsHostIp('[fe80::1]:42657')).toBe('[fe80::1]');
    });
});
