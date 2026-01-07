export { };

declare global {
    interface Window {
        showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
        showOpenFilePicker(options?: any): Promise<FileSystemFileHandle[]>;
        showSaveFilePicker(options?: any): Promise<FileSystemFileHandle>;
        
        // Go WASM
        Go: new () => Go;
        goHashFile: (
            data: Uint8Array,
            progressCallback: (progress: HashProgress) => void
        ) => HashResult;
        goHashFileStream: (
            fileHandle: { getFile: () => Promise<File> },
            progressCallback: (progress: HashProgress) => void,
            algorithms: string[]
        ) => Promise<HashResult>;
        // Incremental hashing functions for large files
        goInitHashers: (algorithms: string[]) => { success: boolean; error?: string };
        goUpdateHashers: (chunk: Uint8Array) => { success: boolean; error?: string };
        goFinalizeHashers: () => HashResult;
    }

    interface FileSystemHandle {
        kind: 'file' | 'directory';
        name: string;
        isSameEntry(other: FileSystemHandle): Promise<boolean>;
    }

    interface FileSystemFileHandle extends FileSystemHandle {
        kind: 'file';
        getFile(): Promise<File>;
        createWritable(options?: any): Promise<FileSystemWritableFileStream>;
    }

    interface FileSystemDirectoryHandle extends FileSystemHandle {
        kind: 'directory';
        values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
        keys(): AsyncIterableIterator<string>;
        entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
        getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
        getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
        removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
        resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    }

    interface FileSystemWritableFileStream extends WritableStream {
        write(data: any): Promise<void>;
        seek(position: number): Promise<void>;
        truncate(size: number): Promise<void>;
    }
    
    // Go WASM Types
    interface Go {
        importObject: WebAssembly.Imports;
        run(instance: WebAssembly.Instance): Promise<void>;
    }

    interface HashProgress {
        bytesProcessed: number;
        totalBytes: number;
        progress: number;
    }

    interface HashResult {
        md5?: string;
        sha1?: string;
        sha256?: string;
        sha512?: string;
    }
}
