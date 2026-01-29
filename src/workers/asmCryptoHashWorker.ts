// Web Worker for hashing via asmcrypto.js (asm.js)
// Supports: SHA1, SHA256, SHA512 (no MD5 in this library)

import { Sha1, Sha256, Sha512, bytes_to_hex } from 'asmcrypto.js';

interface HashMessage {
    type: 'HASH_FILE';
    file: File;
    algorithms: string[];
}

const CHUNK_SIZE = 32 * 1024 * 1024; // 32MB chunks

const SUPPORTED_ALGORITHMS = ['sha1', 'sha256', 'sha512'] as const;
type SupportedAlg = (typeof SUPPORTED_ALGORITHMS)[number];

type Hasher = {
    process: (data: Uint8Array) => unknown;
    finish: () => unknown;
    reset: () => unknown;
    result: Uint8Array | null;
};

function createHasher(algorithm: SupportedAlg): Hasher {
    switch (algorithm) {
        case 'sha1':
            return new Sha1() as unknown as Hasher;
        case 'sha256':
            return new Sha256() as unknown as Hasher;
        case 'sha512':
            return new Sha512() as unknown as Hasher;
        default:
            throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
}

async function hashFile(file: File, algorithms: string[]) {
    const fileSize = file.size;
    let offset = 0;

    try {
        const requested = new Set(algorithms);
        const selectedAlgorithms = SUPPORTED_ALGORITHMS.filter((alg): alg is SupportedAlg => requested.has(alg));

        // If no supported algorithms are requested, don't fail the whole run.
        if (selectedAlgorithms.length === 0) {
            self.postMessage({
                type: 'COMPLETE',
                hashes: {},
                timeTaken: 0,
            });
            return;
        }

        const hashers: Record<SupportedAlg, Hasher> = {} as Record<SupportedAlg, Hasher>;
        for (const alg of selectedAlgorithms) {
            const hasher = createHasher(alg);
            hasher.reset();
            hashers[alg] = hasher;
        }

        const startTime = performance.now();

        while (offset < fileSize) {
            const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
            const arrayBuffer = await chunk.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            for (const hasher of Object.values(hashers)) {
                hasher.process(bytes);
            }

            offset += arrayBuffer.byteLength;

            self.postMessage({
                type: 'PROGRESS',
                bytesProcessed: offset,
                totalBytes: fileSize,
                progress: (offset / fileSize) * 100,
            });
        }

        const result: Record<string, string> = {};
        for (const [alg, hasher] of Object.entries(hashers) as Array<[SupportedAlg, Hasher]>) {
            hasher.finish();
            const digestBytes = hasher.result;
            if (digestBytes) {
                result[alg] = bytes_to_hex(digestBytes);
            }
        }

        const endTime = performance.now();

        self.postMessage({
            type: 'COMPLETE',
            hashes: result,
            timeTaken: endTime - startTime,
        });
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            error: (err as Error).message,
        });
    }
}

self.onmessage = async (e: MessageEvent<HashMessage>) => {
    const { type, file, algorithms } = e.data;

    if (type === 'HASH_FILE' && file && algorithms) {
        await hashFile(file, algorithms);
    }
};
