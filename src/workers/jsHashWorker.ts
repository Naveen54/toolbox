// Web Worker for JavaScript hashing via hash-wasm (incremental, large-file friendly)
import { createMD5, createSHA1, createSHA256, createSHA512, type IHasher } from 'hash-wasm';

interface HashMessage {
    type: 'HASH_FILE';
    file: File;
    algorithms: string[];
}

const CHUNK_SIZE = 128 * 1024 * 1024; // 2MB chunks

const HASHER_FACTORIES: Record<string, () => Promise<IHasher>> = {
    md5: createMD5,
    sha1: createSHA1,
    sha256: createSHA256,
    sha512: createSHA512,
};

async function hashFile(file: File, algorithms: string[]) {
    const fileSize = file.size;
    let offset = 0;

    try {
        const selectedAlgorithms = algorithms.filter((alg) => alg in HASHER_FACTORIES);
        if (selectedAlgorithms.length === 0) {
            throw new Error('No supported algorithms selected');
        }

        const hashers: Record<string, IHasher> = {};
        await Promise.all(
            selectedAlgorithms.map(async (alg) => {
                const hasher = await HASHER_FACTORIES[alg]();
                hasher.init();
                hashers[alg] = hasher;
            })
        );

        const startTime = performance.now();

        while (offset < fileSize) {
            const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
            const arrayBuffer = await chunk.arrayBuffer();

            const bytes = new Uint8Array(arrayBuffer);
            for (const hasher of Object.values(hashers)) {
                hasher.update(bytes);
            }

            offset += arrayBuffer.byteLength;

            // Report progress
            self.postMessage({
                type: 'PROGRESS',
                bytesProcessed: offset,
                totalBytes: fileSize,
                progress: (offset / fileSize) * 100
            });
        }

        // Finalize all hashes
        const result: { [key: string]: string } = {};
        for (const [alg, hasher] of Object.entries(hashers)) {
            result[alg] = hasher.digest('hex');
        }

        const endTime = performance.now();

        self.postMessage({
            type: 'COMPLETE',
            hashes: result,
            timeTaken: endTime - startTime
        });
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            error: (err as Error).message
        });
    }
}

self.onmessage = async (e: MessageEvent<HashMessage>) => {
    const { type, file, algorithms } = e.data;

    if (type === 'HASH_FILE' && file && algorithms) {
        await hashFile(file, algorithms);
    }
};
