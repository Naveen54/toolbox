# File Hasher - Go WASM Module

This directory contains the Go WebAssembly module for file hashing.

## Prerequisites

- Go 1.21 or higher installed
- Go environment variables properly set

## Building the WASM Module

### Windows
```bash
npm run build:wasm
```

Or manually:
```cmd
cd wasm
set GOOS=js
set GOARCH=wasm
go build -o ..\public\hasher.wasm hasher.go
copy "%GOROOT%\misc\wasm\wasm_exec.js" ..\public\
```

### Linux/Mac
```bash
npm run build:wasm
```

Or manually:
```bash
cd wasm
GOOS=js GOARCH=wasm go build -o ../public/hasher.wasm hasher.go
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" ../public/
```

## Features

The WASM module provides:
- **MD5** hashing
- **SHA1** hashing
- **SHA256** hashing
- **SHA512** hashing
- Real-time progress reporting
- Streaming file processing for memory efficiency

## API

### goHashFileStream(fileHandle, progressCallback, selectedAlgorithms)

Hashes a file with selected algorithms and reports progress.

**Parameters:**
- `fileHandle`: File handle object with `getFile()` method
- `progressCallback`: Function called with progress updates `{bytesProcessed, totalBytes, progress}`
- `selectedAlgorithms`: Array of algorithm names (e.g., `['md5', 'sha256']`)

**Returns:**
- Promise that resolves to an object with hash results

**Example:**
```javascript
const result = await window.goHashFileStream(
    fileHandle,
    (progress) => console.log(`${progress.progress}%`),
    ['md5', 'sha256']
);
console.log(result); // { md5: '...', sha256: '...' }
```

## Testing

After building, the WASM files should be in the `public/` directory:
- `hasher.wasm` - The compiled Go WebAssembly module
- `wasm_exec.js` - Go's JavaScript support file for WASM

## Troubleshooting

### WASM not loading
- Ensure Go is properly installed: `go version`
- Check GOROOT is set: `go env GOROOT`
- Rebuild WASM: `npm run build:wasm`

### Build errors
- Make sure you're in the project root directory
- Verify Go installation and PATH
- Check that `wasm/hasher.go` exists

## Development

To modify the hashing logic:
1. Edit `hasher.go`
2. Run `npm run build:wasm`
3. Reload the application

The module processes files in 1MB chunks for efficient memory usage and provides progress updates during processing.
