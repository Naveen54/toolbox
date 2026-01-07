// Web Worker for JavaScript native crypto hashing
import CryptoJS from 'crypto-js';

interface HashMessage {
    type: 'HASH_FILE';
    file: File;
    algorithms: string[];
}

async function hashFile(file: File, algorithms: string[]) {
    const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB chunks
    const fileSize = file.size;
    let offset = 0;

    try {
        // Initialize hashers
        const hashers: { [key: string]: any } = {};
        
        if (algorithms.includes('md5')) {
            hashers['md5'] = CryptoJS.algo.MD5.create();
        }
        if (algorithms.includes('sha1')) {
            hashers['sha1'] = CryptoJS.algo.SHA1.create();
        }
        if (algorithms.includes('sha256')) {
            hashers['sha256'] = CryptoJS.algo.SHA256.create();
        }
        if (algorithms.includes('sha512')) {
            hashers['sha512'] = CryptoJS.algo.SHA512.create();
        }

        const startTime = performance.now();

        while (offset < fileSize) {
            const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
            const arrayBuffer = await chunk.arrayBuffer();
            
            // Convert to WordArray for CryptoJS
            const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer as any);
            
            // Update all hashers
            for (const hasher of Object.values(hashers)) {
                hasher.update(wordArray);
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
            result[alg] = hasher.finalize().toString();
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
