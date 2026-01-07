// Web Worker for file slicing and passing chunks to main thread
// Note: Go WASM runs in main thread due to DOM dependencies

interface HashMessage {
    type: 'HASH_FILE';
    file: File;
}

async function processFile(file: File) {
    const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB optimal chunks
    const fileSize = file.size;
    let offset = 0;

    self.postMessage({ type: 'START', totalSize: fileSize });

    try {
        while (offset < fileSize) {
            const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
            const arrayBuffer = await chunk.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Send chunk to main thread for Go WASM processing
            self.postMessage({
                type: 'CHUNK',
                chunk: uint8Array,
                offset: offset,
                totalSize: fileSize
            }, { transfer: [arrayBuffer] }); // Transfer ownership for performance

            offset += arrayBuffer.byteLength;

            // Report progress
            self.postMessage({
                type: 'PROGRESS',
                bytesProcessed: offset,
                totalBytes: fileSize,
                progress: (offset / fileSize) * 100
            });
        }

        self.postMessage({ type: 'DONE' });
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            error: (err as Error).message
        });
    }
}

self.onmessage = async (e: MessageEvent<HashMessage>) => {
    const { type, file } = e.data;

    if (type === 'HASH_FILE' && file) {
        await processFile(file);
    }
};
