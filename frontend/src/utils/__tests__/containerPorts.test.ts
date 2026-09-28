import { describe, expect, it } from 'vitest';
import {
    selectBestContainerPort,
    orderContainerPorts,
} from '../containerPorts';

describe('selectBestContainerPort', () => {
    it('picks the Transmission web UI over the peer port', () => {
        const ports = [
            { private: 51413, public: 51413, type: 'tcp' },
            { private: 51413, public: 51413, type: 'udp' },
            { private: 9091, public: 9091, type: 'tcp' },
        ];

        expect(selectBestContainerPort(ports)).toBe(9091);
    });

    it('picks the Jellyfin HTTP UI over HTTPS and discovery ports', () => {
        const ports = [
            { private: 8920, public: 8920, type: 'tcp' },
            { private: 1900, public: 1900, type: 'udp' },
            { private: 7359, public: 7359, type: 'udp' },
            { private: 8096, public: 8096, type: 'tcp' },
        ];

        expect(selectBestContainerPort(ports)).toBe(8096);
    });

    it('returns null when nothing is published', () => {
        expect(selectBestContainerPort([])).toBeNull();
        expect(
            selectBestContainerPort([{ private: 80, type: 'tcp' }])
        ).toBeNull();
        expect(selectBestContainerPort(null)).toBeNull();
    });
});

describe('orderContainerPorts', () => {
    it('orders best-first and dedupes by host port', () => {
        const ports = [
            { private: 51413, public: 51413, type: 'tcp' },
            { private: 51413, public: 51413, type: 'udp' },
            { private: 9091, public: 9091, type: 'tcp' },
        ];

        expect(orderContainerPorts(ports)).toEqual([9091, 51413]);
    });
});
