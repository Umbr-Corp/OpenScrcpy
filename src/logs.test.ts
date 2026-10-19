import { describe, expect, it } from 'vitest';
import { appendLogs, LOG_CAP, LogLevel } from './logs';

describe('appendLogs structured levels', () => {
    it('attaches the level to every line of a batch', () => {
        const plain = appendLogs([], ['alpha', 'beta'], 'ok');
        expect(plain[0].text).toBe('alpha');
        expect(plain[0].level).toBe<LogLevel>('ok');
        expect(plain[1].text).toBe('beta');
        expect(plain[1].level).toBe<LogLevel>('ok');
    });

    it('omits the level field when none is passed', () => {
        const out = appendLogs([], 'no info');
        expect(out[0].level).toBeUndefined();
    });

    it('keeps the ring cap unchanged with levels in play', () => {
        const batch = Array.from({ length: LOG_CAP + 30 }, (_, i) => `line ${i}`);
        const outWithLevel = appendLogs([], batch, 'err');
        const outPlain = appendLogs([], batch);
        expect(outWithLevel.length).toBe(LOG_CAP);
        expect(outPlain.length).toBe(LOG_CAP);
        // Newest line wins the tail.
        expect(outWithLevel[outWithLevel.length - 1].text).toBe('line 129');
        expect(outWithLevel[outWithLevel.length - 1].level).toBe('err');
    });
});
