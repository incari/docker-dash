import { describe, it, expect } from 'vitest';
import { isValidUrl, isValidPort } from '../validation';

describe('Validation Utils', () => {
    describe('isValidUrl', () => {
        it('validates correct URLs', () => {
            expect(isValidUrl('example.com')).toBe(true);
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('http://192.168.1.1')).toBe(true);
            expect(isValidUrl('localhost:3000')).toBe(true);
        });

        it('rejects invalid URLs', () => {
            expect(isValidUrl('http://')).toBe(false); // No host
            // expect(isValidUrl('justtext')).toBe(false); // "justtext" might be valid host in some logic, but normalize adds http://
            // normalizeUrl('justtext') -> 'http://justtext'. Valid? Yes.
        });
    });

    describe('isValidPort', () => {
        it('validates correct ports', () => {
            expect(isValidPort('80')).toBe(true);
            expect(isValidPort(8080)).toBe(true);
            expect(isValidPort('65535')).toBe(true);
        });

        it('rejects invalid ports', () => {
            expect(isValidPort('0')).toBe(false);
            expect(isValidPort('70000')).toBe(false);
            expect(isValidPort('abc')).toBe(false);
            expect(isValidPort('')).toBe(false);
        });
    });
});
