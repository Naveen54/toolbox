import React, { useState, useEffect, useRef } from 'react';
import { Hash, Upload, Loader2, CheckCircle2, Copy, Check, FileType } from 'lucide-react';
import { ProgressBar, Label } from 'react-aria-components';
import './FileHasher.scss';

interface HashResult {
    md5?: string;
    sha1?: string;
    sha256?: string;
    sha512?: string;
    timeTaken?: number;
}

interface FileHashInfo {
    file: File;
    goProgress: number;
    jsProgress: number;
    status: 'pending' | 'hashing-go' | 'hashing-js' | 'completed' | 'error';
    goHashes: HashResult;
    jsHashes: HashResult;
    error?: string;
}

export const FileHasher: React.FC = () => {
    const [wasmReady, setWasmReady] = useState(false);
    const [wasmError, setWasmError] = useState<string | null>(null);
    const [fileInfo, setFileInfo] = useState<FileHashInfo | null>(null);
    const [selectedAlgorithms, setSelectedAlgorithms] = useState<string[]>(['md5', 'sha1', 'sha256', 'sha512']);
    const [copiedHash, setCopiedHash] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsWorkerRef = useRef<Worker | null>(null);

    // Initialize WASM in main thread
    useEffect(() => {
        const loadWasm = async () => {
            try {
                const script = document.createElement('script');
                script.src = '/wasm_exec.js';
                script.async = false;
                
                script.onload = async () => {
                    try {
                        // @ts-ignore
                        const go = new Go();
                        
                        const result = await WebAssembly.instantiateStreaming(
                            fetch('/hasher.wasm'),
                            go.importObject
                        );
                        
                        go.run(result.instance);
                        
                        setWasmReady(true);
                    } catch (err) {
                        console.error('Failed to instantiate WASM:', err);
                        setWasmError(`Failed to load WASM: ${(err as Error).message}`);
                    }
                };
                
                script.onerror = () => {
                    setWasmError('Failed to load wasm_exec.js');
                };
                
                document.body.appendChild(script);
                
                return () => {
                    if (document.body.contains(script)) {
                        document.body.removeChild(script);
                    }
                };
            } catch (err) {
                console.error('Error loading WASM:', err);
                setWasmError(`Error: ${(err as Error).message}`);
            }
        };

        loadWasm();

        // Initialize JS Crypto Worker
        try {
            const jsWorker = new Worker(new URL('../workers/jsHashWorker.ts', import.meta.url), { type: 'module' });
            jsWorkerRef.current = jsWorker;
        } catch (err) {
            console.error('Failed to create JS worker:', err);
        }

        return () => {
            jsWorkerRef.current?.terminate();
        };
    }, []);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        setFileInfo({
            file,
            goProgress: 0,
            jsProgress: 0,
            status: 'pending',
            goHashes: {},
            jsHashes: {},
        });

        // Start hashing
        await hashFile(file);
    };

    const hashFile = async (file: File) => {
        if (!wasmReady || !jsWorkerRef.current) {
            setFileInfo(prev => prev ? { ...prev, status: 'error', error: 'Workers not ready' } : null);
            return;
        }

        setFileInfo(prev => prev ? { ...prev, status: 'hashing-go', goProgress: 0, jsProgress: 0, goHashes: {}, jsHashes: {} } : null);

        try {
            // Hash with Go WASM first
            const goResult = await hashWithGoWasm(file, selectedAlgorithms);
            
            setFileInfo(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    status: 'hashing-js',
                    goHashes: goResult,
                };
            });

            // Then hash with JS Crypto
            const jsResult = await hashWithJsCrypto(file, selectedAlgorithms);

            setFileInfo(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    status: 'completed',
                    jsHashes: jsResult,
                };
            });
        } catch (err) {
            console.error('Hashing error:', err);
            setFileInfo(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    status: 'error',
                    error: (err as Error).message,
                };
            });
        }
    };

    const hashWithGoWasm = async (file: File, algorithms: string[]): Promise<HashResult> => {
        const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB optimal chunks
        const fileSize = file.size;
        let offset = 0;

        // @ts-ignore
        if (!window.goInitHashers || !window.goUpdateHashers || !window.goFinalizeHashers) {
            throw new Error('Go WASM functions not available');
        }

        // @ts-ignore
        window.goInitHashers(algorithms);

        const startTime = performance.now();

        while (offset < fileSize) {
            const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
            const arrayBuffer = await chunk.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // @ts-ignore
            window.goUpdateHashers(uint8Array);

            offset += arrayBuffer.byteLength;

            // Report Go progress
            setFileInfo(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    goProgress: Math.round((offset / fileSize) * 100),
                };
            });

            // Yield to UI
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // @ts-ignore
        const result = window.goFinalizeHashers();
        const endTime = performance.now();

        return { ...result, timeTaken: endTime - startTime };
    };

    const hashWithJsCrypto = async (file: File, algorithms: string[]): Promise<HashResult> => {
        return new Promise((resolve, reject) => {
            if (!jsWorkerRef.current) {
                reject(new Error('JS Worker not available'));
                return;
            }

            const messageHandler = (e: MessageEvent) => {
                const { type, hashes, timeTaken, error, progress } = e.data;

                if (type === 'PROGRESS') {
                    // Report JS progress
                    setFileInfo(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            jsProgress: Math.round(progress),
                        };
                    });
                } else if (type === 'COMPLETE') {
                    jsWorkerRef.current?.removeEventListener('message', messageHandler);
                    resolve({ ...hashes, timeTaken });
                } else if (type === 'ERROR') {
                    jsWorkerRef.current?.removeEventListener('message', messageHandler);
                    reject(new Error(error));
                }
            };

            jsWorkerRef.current.addEventListener('message', messageHandler);
            jsWorkerRef.current.postMessage({
                type: 'HASH_FILE',
                file,
                algorithms
            });
        });
    };

    const handleCopyHash = (algorithm: string, hash: string, hasherType: 'go' | 'js') => {
        navigator.clipboard.writeText(hash);
        setCopiedHash(`${hasherType}-${algorithm}`);
        setTimeout(() => setCopiedHash(null), 2000);
    };

    const toggleAlgorithm = (algorithm: string) => {
        setSelectedAlgorithms(prev => {
            if (prev.includes(algorithm)) {
                return prev.filter(alg => alg !== algorithm);
            } else {
                return [...prev, algorithm];
            }
        });
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const handleSelectFile = () => {
        fileInputRef.current?.click();
    };

    const getStatusIcon = () => {
        if (!fileInfo) return null;
        
        switch (fileInfo.status) {
            case 'hashing-go':
            case 'hashing-js':
                return <Loader2 size={20} className="spin" />;
            case 'completed':
                return <CheckCircle2 size={20} className="text-success" />;
            case 'error':
                return <FileType size={20} className="text-error" />;
            default:
                return null;
        }
    };

    return (
        <div className="file-hasher-page fade-in">
            <div className="page-header">
                <h2><Hash size={24} /> File Hasher</h2>
                <p className="subtitle">Generate cryptographic hashes for your files</p>
            </div>

            {wasmError && (
                <div className="error-banner glass-panel">
                    <p><strong>WASM Error:</strong> {wasmError}</p>
                    <p className="hint">Run <code>npm run build:wasm</code> to build the Go WASM module</p>
                </div>
            )}

            {!wasmReady && !wasmError && (
                <div className="loading-banner glass-panel">
                    <Loader2 size={20} className="spin" />
                    <span>Loading WASM module...</span>
                </div>
            )}

            {wasmReady && (
                <>
                    {/* Algorithm Selection */}
                    <div className="algorithms-section glass-panel">
                        <Label className="section-label">Hash Algorithms</Label>
                        <div className="algorithm-checkboxes">
                            {['md5', 'sha1', 'sha256', 'sha512'].map(alg => (
                                <label key={alg} className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={selectedAlgorithms.includes(alg)}
                                        onChange={() => toggleAlgorithm(alg)}
                                        disabled={fileInfo?.status === 'hashing-go' || fileInfo?.status === 'hashing-js'}
                                    />
                                    <span className="algorithm-name">{alg.toUpperCase()}</span>
                                </label>
                            ))}
                        </div>
                        {selectedAlgorithms.length === 0 && (
                            <p className="warning-text">Please select at least one algorithm</p>
                        )}
                    </div>

                    {/* File Selection */}
                    <div className="file-selection-section glass-panel">
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                            disabled={fileInfo?.status === 'hashing-go' || fileInfo?.status === 'hashing-js' || selectedAlgorithms.length === 0}
                        />
                        
                        {!fileInfo ? (
                            <div className="upload-area" onClick={handleSelectFile}>
                                <Upload size={48} className="upload-icon" />
                                <h3>Select a file to hash</h3>
                                <p>Click to browse or drag and drop</p>
                                <button 
                                    className="btn-primary" 
                                    onClick={handleSelectFile}
                                    disabled={selectedAlgorithms.length === 0}
                                >
                                    Select File
                                </button>
                            </div>
                        ) : (
                            <div className="file-info-container">
                                <div className="file-header">
                                    <div className="file-details">
                                        {getStatusIcon()}
                                        <div>
                                            <h3 className="file-name">{fileInfo.file.name}</h3>
                                            <p className="file-size">{formatFileSize(fileInfo.file.size)}</p>
                                        </div>
                                    </div>
                                    {fileInfo.status !== 'hashing-go' && fileInfo.status !== 'hashing-js' && (
                                        <button 
                                            className="btn-secondary" 
                                            onClick={handleSelectFile}
                                            disabled={selectedAlgorithms.length === 0}
                                        >
                                            Select Another File
                                        </button>
                                    )}
                                </div>

                                {/* Progress Bars */}
                                {(fileInfo.status === 'hashing-go' || fileInfo.status === 'hashing-js' || fileInfo.status === 'completed') && (
                                    <div className="progress-sections">
                                        {/* Go WASM Progress */}
                                        <div className="progress-section">
                                            <div className="progress-header">
                                                <Label>Go WASM Hasher</Label>
                                                <span className="progress-value">
                                                    {fileInfo.status === 'hashing-go' ? `${fileInfo.goProgress}%` : 
                                                     fileInfo.goProgress === 100 ? '✓ Complete' : 
                                                     fileInfo.goProgress === 0 ? 'Pending...' : `${fileInfo.goProgress}%`}
                                                </span>
                                            </div>
                                            <ProgressBar value={fileInfo.goProgress} className="progress-bar" aria-label="Go WASM Hasher Progress">
                                                <div 
                                                    className={`progress-fill ${fileInfo.goProgress === 100 ? 'complete' : ''}`}
                                                    style={{ width: `${fileInfo.goProgress}%` }} 
                                                />
                                            </ProgressBar>
                                        </div>

                                        {/* JS Crypto Progress */}
                                        <div className="progress-section">
                                            <div className="progress-header">
                                                <Label>JS Crypto Hasher</Label>
                                                <span className="progress-value">
                                                    {fileInfo.status === 'hashing-js' ? `${fileInfo.jsProgress}%` : 
                                                     fileInfo.jsProgress === 100 ? '✓ Complete' : 
                                                     fileInfo.jsProgress === 0 ? 'Pending...' : `${fileInfo.jsProgress}%`}
                                                </span>
                                            </div>
                                            <ProgressBar value={fileInfo.jsProgress} className="progress-bar" aria-label="JS Crypto Hasher Progress">
                                                <div 
                                                    className={`progress-fill ${fileInfo.jsProgress === 100 ? 'complete' : ''}`}
                                                    style={{ width: `${fileInfo.jsProgress}%` }} 
                                                />
                                            </ProgressBar>
                                        </div>
                                    </div>
                                )}

                                {/* Error Message */}
                                {fileInfo.status === 'error' && (
                                    <div className="error-message">
                                        <p>Error: {fileInfo.error}</p>
                                    </div>
                                )}

                                {/* Hash Results */}
                                {fileInfo.status === 'completed' && (
                                    <div className="hash-results">
                                        {/* Go WASM Results */}
                                        <div className="hash-group">
                                            <Label className="section-label">
                                                Go WASM Results 
                                                {fileInfo.goHashes.timeTaken && (
                                                    <span className="time-badge">⚡ {(fileInfo.goHashes.timeTaken / 1000).toFixed(2)}s</span>
                                                )}
                                            </Label>
                                            <div className="hash-list">
                                                {fileInfo.goHashes && Object.keys(fileInfo.goHashes).filter(k => k !== 'timeTaken').length > 0 ? (
                                                    Object.entries(fileInfo.goHashes)
                                                        .filter(([alg]) => alg !== 'timeTaken')
                                                        .map(([algorithm, hash]) => (
                                                            <div key={`go-${algorithm}`} className="hash-item">
                                                                <div className="hash-header">
                                                                    <span className="hash-algorithm">{algorithm.toUpperCase()}</span>
                                                                    <button
                                                                        className="btn-icon"
                                                                        onClick={() => handleCopyHash(algorithm, hash!, 'go')}
                                                                        title="Copy to clipboard"
                                                                    >
                                                                        {copiedHash === `go-${algorithm}` ? (
                                                                            <Check size={16} className="text-success" />
                                                                        ) : (
                                                                            <Copy size={16} />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <code className="hash-value">{hash}</code>
                                                            </div>
                                                        ))
                                                ) : (
                                                    <div className="info-message">
                                                        <p>No Go WASM hashes generated.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* JS Crypto Results */}
                                        <div className="hash-group">
                                            <Label className="section-label">
                                                JS Crypto Results 
                                                {fileInfo.jsHashes.timeTaken && (
                                                    <span className="time-badge">⚡ {(fileInfo.jsHashes.timeTaken / 1000).toFixed(2)}s</span>
                                                )}
                                            </Label>
                                            <div className="hash-list">
                                                {fileInfo.jsHashes && Object.keys(fileInfo.jsHashes).filter(k => k !== 'timeTaken').length > 0 ? (
                                                    Object.entries(fileInfo.jsHashes)
                                                        .filter(([alg]) => alg !== 'timeTaken')
                                                        .map(([algorithm, hash]) => (
                                                            <div key={`js-${algorithm}`} className="hash-item">
                                                                <div className="hash-header">
                                                                    <span className="hash-algorithm">{algorithm.toUpperCase()}</span>
                                                                    <button
                                                                        className="btn-icon"
                                                                        onClick={() => handleCopyHash(algorithm, hash!, 'js')}
                                                                        title="Copy to clipboard"
                                                                    >
                                                                        {copiedHash === `js-${algorithm}` ? (
                                                                            <Check size={16} className="text-success" />
                                                                        ) : (
                                                                            <Copy size={16} />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <code className="hash-value">{hash}</code>
                                                            </div>
                                                        ))
                                                ) : (
                                                    <div className="info-message">
                                                        <p>No JS Crypto hashes generated.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
