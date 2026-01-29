import React, { useState, useEffect, useRef } from 'react';
import { Hash, Upload, Loader2, CheckCircle2, Copy, Check, FileType } from 'lucide-react';
import { ProgressBar, Label } from 'react-aria-components';
import './FileHasher.scss';
import { withPageView } from '../utils/withPageView';
import { trackEvent } from '../utils/analytics';

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
    asmProgress: number;
    status: 'pending' | 'hashing-go' | 'hashing-js' | 'hashing-asm' | 'completed' | 'error';
    goHashes: HashResult;
    jsHashes: HashResult;
    asmHashes: HashResult;
    error?: string;
}

const FileHasherPage: React.FC = () => {
    const [wasmReady, setWasmReady] = useState(false);
    const [wasmError, setWasmError] = useState<string | null>(null);
    const [fileInfo, setFileInfo] = useState<FileHashInfo | null>(null);
    const [selectedAlgorithms, setSelectedAlgorithms] = useState<string[]>(['md5', 'sha1', 'sha256', 'sha512']);
    const [copiedHash, setCopiedHash] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsWorkerRef = useRef<Worker | null>(null);
    const goWorkerRef = useRef<Worker | null>(null);
    const asmWorkerRef = useRef<Worker | null>(null);

    // Initialize workers
    useEffect(() => {
        // Initialize Go WASM Worker
        try {
            const goWorker = new Worker(
                new URL('../workers/goHashWorker.ts', import.meta.url),
                { type: 'module' }
            );
            
            goWorker.onmessage = (e) => {
                const { type, success, error, zeroCopyEnabled } = e.data;
                if (type === 'INIT_COMPLETE') {
                    if (success) {
                        console.log(`Go WASM worker initialized (zero-copy: ${zeroCopyEnabled})`);
                        setWasmReady(true);
                    } else {
                        console.error('Go WASM worker init failed:', error);
                        setWasmError(`Failed to load WASM: ${error}`);
                    }
                }
            };
            
            goWorker.onerror = (err) => {
                console.error('Go worker error:', err);
                setWasmError(`Worker error: ${err.message}`);
            };
            
            goWorkerRef.current = goWorker;
        } catch (err) {
            console.error('Failed to create Go worker:', err);
            setWasmError(`Failed to create worker: ${(err as Error).message}`);
        }

        // Initialize C Hash WASM Worker
        try {
            const jsWorker = new Worker(new URL('../workers/jsHashWorker.ts', import.meta.url), { type: 'module' });
            jsWorkerRef.current = jsWorker;
        } catch (err) {
            console.error('Failed to create JS worker:', err);
        }

        // Initialize asmcrypto.js Worker
        try {
            const asmWorker = new Worker(new URL('../workers/asmCryptoHashWorker.ts', import.meta.url), { type: 'module' });
            asmWorkerRef.current = asmWorker;
        } catch (err) {
            console.error('Failed to create asmcrypto worker:', err);
        }

        return () => {
            goWorkerRef.current?.terminate();
            jsWorkerRef.current?.terminate();
            asmWorkerRef.current?.terminate();
        };
    }, []);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        trackEvent('file_selected', {
            file_size_bytes: file.size,
            file_type: file.type || 'unknown',
        });
        setFileInfo({
            file,
            goProgress: 0,
            jsProgress: 0,
            asmProgress: 0,
            status: 'pending',
            goHashes: {},
            jsHashes: {},
            asmHashes: {},
        });

        // Start hashing
        await hashFile(file);
    };

    const hashFile = async (file: File) => {
        if (!wasmReady || !jsWorkerRef.current) {
            setFileInfo(prev => prev ? { ...prev, status: 'error', error: 'Workers not ready' } : null);
            return;
        }

        setFileInfo(prev => prev ? { ...prev, status: 'hashing-go', goProgress: 0, jsProgress: 0, asmProgress: 0, goHashes: {}, jsHashes: {}, asmHashes: {} } : null);

        try {
            // Hash with Go WASM first
            trackEvent('hash_started', {
                hasher_type: 'go',
                file_size_bytes: file.size,
                algorithms: selectedAlgorithms.join(','),
            });
            const goResult = await hashWithGoWasm(file, selectedAlgorithms);
            
            setFileInfo(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    status: 'hashing-js',
                    goHashes: goResult,
                };
            });

            trackEvent('hash_completed', {
                hasher_type: 'go',
                file_size_bytes: file.size,
                algorithms: selectedAlgorithms.join(','),
                duration_ms: goResult.timeTaken ? Math.round(goResult.timeTaken) : undefined,
            });

            // Then hash with C Hash WASM
            trackEvent('hash_started', {
                hasher_type: 'js',
                file_size_bytes: file.size,
                algorithms: selectedAlgorithms.join(','),
            });
            const jsResult = await hashWithJsCrypto(file, selectedAlgorithms);

            setFileInfo(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    status: asmWorkerRef.current ? 'hashing-asm' : 'completed',
                    jsHashes: jsResult,
                };
            });

            trackEvent('hash_completed', {
                hasher_type: 'js',
                file_size_bytes: file.size,
                algorithms: selectedAlgorithms.join(','),
                duration_ms: jsResult.timeTaken ? Math.round(jsResult.timeTaken) : undefined,
            });

            // Finally hash with asmcrypto.js (if available)
            if (asmWorkerRef.current) {
                trackEvent('hash_started', {
                    hasher_type: 'asmcrypto',
                    file_size_bytes: file.size,
                    algorithms: selectedAlgorithms.join(','),
                });

                const asmResult = await hashWithAsmCrypto(file, selectedAlgorithms);

                setFileInfo(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        status: 'completed',
                        asmHashes: asmResult,
                    };
                });

                trackEvent('hash_completed', {
                    hasher_type: 'asmcrypto',
                    file_size_bytes: file.size,
                    algorithms: selectedAlgorithms.join(','),
                    duration_ms: asmResult.timeTaken ? Math.round(asmResult.timeTaken) : undefined,
                });
            }

            // Dedicated event you can mark as a GA4 "Key Event" (conversion).
            // GA4 key-events are configured in GA UI; code just needs to emit a stable event name.
            trackEvent('file_hash_completed', {
                file_size_bytes: file.size,
                algorithms: selectedAlgorithms.join(','),
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

            trackEvent('hash_failed');
        }
    };

    const hashWithGoWasm = async (file: File, algorithms: string[]): Promise<HashResult> => {
        return new Promise((resolve, reject) => {
            if (!goWorkerRef.current) {
                reject(new Error('Go Worker not available'));
                return;
            }

            const messageHandler = (e: MessageEvent) => {
                const { type, hashes, timeTaken, error, progress } = e.data;

                if (type === 'PROGRESS') {
                    // Report Go progress
                    setFileInfo(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            goProgress: Math.round(progress),
                        };
                    });
                } else if (type === 'COMPLETE') {
                    goWorkerRef.current?.removeEventListener('message', messageHandler);
                    resolve({ ...hashes, timeTaken });
                } else if (type === 'ERROR') {
                    goWorkerRef.current?.removeEventListener('message', messageHandler);
                    reject(new Error(error));
                }
            };

            goWorkerRef.current.addEventListener('message', messageHandler);
            goWorkerRef.current.postMessage({
                type: 'HASH_FILE',
                file,
                algorithms
            });
        });
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

    const hashWithAsmCrypto = async (file: File, algorithms: string[]): Promise<HashResult> => {
        return new Promise((resolve, reject) => {
            if (!asmWorkerRef.current) {
                resolve({});
                return;
            }

            const messageHandler = (e: MessageEvent) => {
                const { type, hashes, timeTaken, error, progress } = e.data;

                if (type === 'PROGRESS') {
                    setFileInfo(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            asmProgress: Math.round(progress),
                        };
                    });
                } else if (type === 'COMPLETE') {
                    asmWorkerRef.current?.removeEventListener('message', messageHandler);
                    resolve({ ...hashes, timeTaken });
                } else if (type === 'ERROR') {
                    asmWorkerRef.current?.removeEventListener('message', messageHandler);
                    reject(new Error(error));
                }
            };

            asmWorkerRef.current.addEventListener('message', messageHandler);
            asmWorkerRef.current.postMessage({
                type: 'HASH_FILE',
                file,
                algorithms,
            });
        });
    };

    const handleCopyHash = (algorithm: string, hash: string, hasherType: 'go' | 'js' | 'asm') => {
        navigator.clipboard.writeText(hash);
        setCopiedHash(`${hasherType}-${algorithm}`);
        trackEvent('hash_copied', { hasher_type: hasherType, algorithm });
        setTimeout(() => setCopiedHash(null), 2000);
    };

    const toggleAlgorithm = (algorithm: string) => {
        setSelectedAlgorithms(prev => {
            if (prev.includes(algorithm)) {
                trackEvent('hash_algorithm_toggled', { algorithm, action: 'remove' });
                return prev.filter(alg => alg !== algorithm);
            } else {
                trackEvent('hash_algorithm_toggled', { algorithm, action: 'add' });
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
        trackEvent('select_file_clicked');
        fileInputRef.current?.click();
    };

    const getStatusIcon = () => {
        if (!fileInfo) return null;
        
        switch (fileInfo.status) {
            case 'hashing-go':
            case 'hashing-js':
            case 'hashing-asm':
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
                                        disabled={fileInfo?.status === 'hashing-go' || fileInfo?.status === 'hashing-js' || fileInfo?.status === 'hashing-asm'}
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
                            disabled={fileInfo?.status === 'hashing-go' || fileInfo?.status === 'hashing-js' || fileInfo?.status === 'hashing-asm' || selectedAlgorithms.length === 0}
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
                                    {fileInfo.status !== 'hashing-go' && fileInfo.status !== 'hashing-js' && fileInfo.status !== 'hashing-asm' && (
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
                                {(fileInfo.status === 'hashing-go' || fileInfo.status === 'hashing-js' || fileInfo.status === 'hashing-asm' || fileInfo.status === 'completed') && (
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

                                        {/* C Hash WASM Progress */}
                                        <div className="progress-section">
                                            <div className="progress-header">
                                                <Label>C Hash WASM</Label>
                                                <span className="progress-value">
                                                    {fileInfo.status === 'hashing-js' ? `${fileInfo.jsProgress}%` : 
                                                     fileInfo.jsProgress === 100 ? '✓ Complete' : 
                                                     fileInfo.jsProgress === 0 ? 'Pending...' : `${fileInfo.jsProgress}%`}
                                                </span>
                                            </div>
                                            <ProgressBar value={fileInfo.jsProgress} className="progress-bar" aria-label="C Hash WASM Progress">
                                                <div 
                                                    className={`progress-fill ${fileInfo.jsProgress === 100 ? 'complete' : ''}`}
                                                    style={{ width: `${fileInfo.jsProgress}%` }} 
                                                />
                                            </ProgressBar>
                                        </div>

                                        {/* asmcrypto.js Progress */}
                                        <div className="progress-section">
                                            <div className="progress-header">
                                                <Label>asmcrypto.js</Label>
                                                <span className="progress-value">
                                                    {fileInfo.status === 'hashing-asm' ? `${fileInfo.asmProgress}%` :
                                                     fileInfo.asmProgress === 100 ? '✓ Complete' :
                                                     fileInfo.asmProgress === 0 ? 'Pending...' : `${fileInfo.asmProgress}%`}
                                                </span>
                                            </div>
                                            <ProgressBar value={fileInfo.asmProgress} className="progress-bar" aria-label="asmcrypto.js Progress">
                                                <div
                                                    className={`progress-fill ${fileInfo.asmProgress === 100 ? 'complete' : ''}`}
                                                    style={{ width: `${fileInfo.asmProgress}%` }}
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

                                        {/* C Hash WASM Results */}
                                        <div className="hash-group">
                                            <Label className="section-label">
                                                C Hash WASM Results 
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
                                                        <p>No C Hash WASM hashes generated.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* asmcrypto.js Results */}
                                        <div className="hash-group">
                                            <Label className="section-label">
                                                asmcrypto.js Results
                                                {fileInfo.asmHashes.timeTaken && (
                                                    <span className="time-badge">⚡ {(fileInfo.asmHashes.timeTaken / 1000).toFixed(2)}s</span>
                                                )}
                                            </Label>
                                            <div className="hash-list">
                                                {fileInfo.asmHashes && Object.keys(fileInfo.asmHashes).filter(k => k !== 'timeTaken').length > 0 ? (
                                                    Object.entries(fileInfo.asmHashes)
                                                        .filter(([alg]) => alg !== 'timeTaken')
                                                        .map(([algorithm, hash]) => (
                                                            <div key={`asm-${algorithm}`} className="hash-item">
                                                                <div className="hash-header">
                                                                    <span className="hash-algorithm">{algorithm.toUpperCase()}</span>
                                                                    <button
                                                                        className="btn-icon"
                                                                        onClick={() => handleCopyHash(algorithm, hash!, 'asm')}
                                                                        title="Copy to clipboard"
                                                                    >
                                                                        {copiedHash === `asm-${algorithm}` ? (
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
                                                        <p>No asmcrypto.js hashes generated (supports SHA1/SHA256/SHA512 only).</p>
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

export const FileHasher = withPageView(FileHasherPage, 'File Hasher');
