// Web Worker for Go WASM hashing
// This runs the Go WASM hasher in a separate thread to avoid blocking the UI

// Declare worker globals for TypeScript
declare function importScripts(...urls: string[]): void;
declare const Go: new () => GoInstance;

interface HashMessage {
    type: 'INIT' | 'HASH_FILE';
    file?: File;
    algorithms?: string[];
}

interface GoInstance {
    run: (instance: WebAssembly.Instance) => Promise<void>;
    importObject: WebAssembly.Imports;
}

// Worker state
let wasmReady = false;
let wasmMemory: WebAssembly.Memory | null = null;
let bufferPtr = 0;
let bufferSize = 0;
let useZeroCopy = false;

// Go WASM functions (will be set on globalThis after Go runs)
declare const goInitHashers: (algorithms: string[]) => void;
declare const goUpdateHashers: (data: Uint8Array) => void;
declare const goUpdateHashersZeroCopy: (length: number) => void;
declare const goFinalizeHashers: () => Record<string, string>;
declare const goAllocateBuffer: (size: number) => { success: boolean; pointer: number; size: number; error?: string };

// Load wasm_exec.js dynamically (works in both module and classic workers)
async function loadWasmExec(): Promise<void> {
    // Try importScripts first (classic worker)
    if (typeof importScripts === 'function') {
        try {
            importScripts('/wasm_exec.js');
            return;
        } catch (e) {
            console.log('[GoWorker] importScripts failed, trying fetch approach');
        }
    }
    
    // Fallback: fetch and evaluate (module worker)
    const response = await fetch('/wasm_exec.js');
    const scriptText = await response.text();
     
    (0, eval)(scriptText);
}

// Initialize WASM
async function initWasm(): Promise<void> {
    try {
        // Load Go's JS support file
        await loadWasmExec();
        
        const go: GoInstance = new Go();
        
        const response = await fetch('/hasher.wasm');
        const result = await WebAssembly.instantiateStreaming(response, go.importObject);
        
        // Start Go runtime (this is non-blocking after init)
        go.run(result.instance);
        
        // Initialize zero-copy buffer
        initializeZeroCopyBuffer(result.instance);
        
        wasmReady = true;
        
        self.postMessage({
            type: 'INIT_COMPLETE',
            success: true,
            zeroCopyEnabled: useZeroCopy
        });
    } catch (err) {
        console.error('[GoWorker] Failed to initialize WASM:', err);
        self.postMessage({
            type: 'INIT_COMPLETE',
            success: false,
            error: (err as Error).message
        });
    }
}

function initializeZeroCopyBuffer(instance: WebAssembly.Instance): void {
    const BUFFER_SIZE = 128 * 1024 * 1024; // 128MB buffer
    
    try {
        // @ts-ignore - goAllocateBuffer is defined by Go WASM
        if (typeof goAllocateBuffer !== 'function') {
            console.log('[GoWorker] goAllocateBuffer function not available');
            useZeroCopy = false;
            return;
        }

        // Ask Go to allocate a buffer and return the pointer
        // @ts-ignore
        const result = goAllocateBuffer(BUFFER_SIZE);
        
        if (!result.success) {
            console.log('[GoWorker] Failed to allocate buffer:', result.error);
            useZeroCopy = false;
            return;
        }

        // Get the WASM linear memory - Go exports it as "mem"
        const memory = instance.exports.mem as WebAssembly.Memory;
        if (!memory) {
            console.log('[GoWorker] WASM memory not accessible - exports.mem not found');
            useZeroCopy = false;
            return;
        }

        wasmMemory = memory;
        bufferPtr = result.pointer;
        bufferSize = result.size;
        useZeroCopy = true;
        
        console.log(`[GoWorker] Zero-copy buffer initialized: ${BUFFER_SIZE / 1024 / 1024}MB at pointer ${result.pointer}`);
    } catch (err) {
        console.error('[GoWorker] Failed to initialize zero-copy buffer:', err);
        useZeroCopy = false;
    }
}

function getWasmBufferView(length: number): Uint8Array | null {
    if (!wasmMemory) return null;
    try {
        // Create a fresh view each time - memory.buffer may have changed if Go grew memory
        return new Uint8Array(wasmMemory.buffer, bufferPtr, length);
    } catch (err) {
        console.error('[GoWorker] Failed to create WASM buffer view:', err);
        return null;
    }
}

async function hashFile(file: File, algorithms: string[]): Promise<void> {
    if (!wasmReady) {
        self.postMessage({
            type: 'ERROR',
            error: 'WASM not initialized'
        });
        return;
    }

    const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
    const fileSize = file.size;
    let offset = 0;

    try {
        // Initialize hashers
        // @ts-ignore
        goInitHashers(algorithms);

        const startTime = performance.now();
        const canUseZeroCopy = useZeroCopy && wasmMemory;
        
        if (canUseZeroCopy) {
            console.log('[GoWorker] Using zero-copy transfer (direct WASM memory write)');
        }

        while (offset < fileSize) {
            const chunkEnd = Math.min(offset + CHUNK_SIZE, fileSize);
            const chunk = file.slice(offset, chunkEnd);
            const arrayBuffer = await chunk.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const chunkLength = uint8Array.length;

            if (canUseZeroCopy && chunkLength <= bufferSize) {
                // TRUE zero-copy: write directly to WASM linear memory
                const wasmBufferView = getWasmBufferView(chunkLength);
                
                if (wasmBufferView) {
                    wasmBufferView.set(uint8Array);
                    // @ts-ignore - Go reads from its own memory, no copy needed!
                    goUpdateHashersZeroCopy(chunkLength);
                } else {
                    // View creation failed, fall back to copy
                    // @ts-ignore
                    goUpdateHashers(uint8Array);
                }
            } else {
                // Fallback: traditional copy method
                // @ts-ignore
                goUpdateHashers(uint8Array);
            }

            offset += chunkLength;

            // Report progress
            self.postMessage({
                type: 'PROGRESS',
                bytesProcessed: offset,
                totalBytes: fileSize,
                progress: (offset / fileSize) * 100
            });
        }

        // Finalize and get results
        // @ts-ignore
        const result = goFinalizeHashers();
        const endTime = performance.now();

        self.postMessage({
            type: 'COMPLETE',
            hashes: result,
            timeTaken: endTime - startTime
        });
    } catch (err) {
        console.error('[GoWorker] Hashing error:', err);
        self.postMessage({
            type: 'ERROR',
            error: (err as Error).message
        });
    }
}

// Message handler
self.onmessage = async (e: MessageEvent<HashMessage>) => {
    const { type, file, algorithms } = e.data;

    switch (type) {
        case 'INIT':
            await initWasm();
            break;
            
        case 'HASH_FILE':
            if (file && algorithms) {
                await hashFile(file, algorithms);
            } else {
                self.postMessage({
                    type: 'ERROR',
                    error: 'Missing file or algorithms'
                });
            }
            break;
            
        default:
            console.warn('[GoWorker] Unknown message type:', type);
    }
};

// Auto-initialize on worker start
initWasm();
