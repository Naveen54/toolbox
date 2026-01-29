# File Hasher Feature

## Overview
The File Hasher is a web-based tool that uses **Go WebAssembly (WASM)** to compute cryptographic hashes of files directly in the browser. It supports multiple hash algorithms and provides real-time progress feedback.

## Features

### ✅ Current Features (Phase 1)
- **File Selection**: Browse and select files from your device
- **Multiple Hash Algorithms**: 
  - MD5
  - SHA1
  - SHA256
  - SHA512
- **Real-time Progress**: Visual progress bar during hashing
- **Go WASM Backend**: High-performance hashing using compiled Go code
- **Multiple Hasher Implementations**:
    - Go WASM (Go stdlib crypto)
    - hash-wasm (WASM-backed incremental hashing)
    - asmcrypto.js (asm.js hashing for SHA1/SHA256/SHA512)
- **Copy to Clipboard**: Easy hash value copying
- **Algorithm Selection**: Choose which algorithms to compute
- **Beautiful UI**: Glassmorphic design consistent with the app

### 🚀 Planned Features (Phase 2)
- **Folder Support**: Select folders and hash all files recursively
- **Parallel Processing**: Configure number of concurrent hash operations
- **Queue Management**: View and manage multiple files in queue
- **Hash Comparison**: Compare hash values between files
- **Export Results**: Save hash results to CSV/JSON
- **Drag & Drop**: Drag files directly into the interface
- **Hash Verification**: Compare computed hashes against provided checksums

## Architecture

### Frontend (React + TypeScript)
- **FileHasher.tsx**: Main component handling UI and WASM integration
- **FileHasher.scss**: Styling with glassmorphic effects
- State management for file info, progress, and results

### Backend (Go WASM)
- **hasher.go**: Core hashing logic compiled to WebAssembly
- Processes files in 1MB chunks for memory efficiency
- Provides progress callbacks to JavaScript
- Supports streaming file processing

### Build System
- **build-wasm.js**: Node.js script to compile Go to WASM
- Automatically copies required runtime files
- Integrated into npm build process

## Usage

### Prerequisites
- Go 1.21 or higher
- Node.js and npm

### Building
```bash
# Build WASM module
npm run build:wasm

# Development
npm run dev

# Production build (includes WASM)
npm run build
```

### Using the Tool
1. Navigate to `/file-hasher`
2. Select hash algorithms (MD5, SHA1, SHA256, SHA512)
3. Click "Select File" and choose a file
4. Watch real-time progress
5. Copy hash values when complete

## Performance

### Benchmarks
- **Small files (<10MB)**: Near-instant hashing
- **Medium files (10-100MB)**: ~1-3 seconds
- **Large files (>100MB)**: Progress updates every second

### Memory Efficiency
- Files are processed in 1MB chunks
- No full file loading into memory
- Suitable for large files (tested up to 1GB+)

## Technical Details

### WASM Integration
```typescript
// Load WASM module
const go = new Go();
const result = await WebAssembly.instantiateStreaming(
    fetch('/hasher.wasm'),
    go.importObject
);
go.run(result.instance);

// Call hashing function
const hashes = await window.goHashFileStream(
    fileHandle,
    (progress) => updateProgress(progress),
    ['md5', 'sha256']
);
```

### Progress Reporting
The Go code reports progress periodically:
```go
type HashProgress struct {
    BytesProcessed int64
    TotalBytes     int64
    Progress       float64 // 0-100
}
```

### Algorithm Implementation
Uses Go's standard library crypto packages:
- `crypto/md5`
- `crypto/sha1`
- `crypto/sha256`
- `crypto/sha512`

## File Structure
```
wasm/
├── hasher.go           # Go source code
├── go.mod              # Go module definition
└── README.md           # WASM documentation

src/pages/
├── FileHasher.tsx      # React component
└── FileHasher.scss     # Styles

public/
├── hasher.wasm         # Compiled WASM (generated)
└── wasm_exec.js        # Go WASM runtime (generated)

build-wasm.js           # Build script
build-wasm.bat          # Windows build script
build-wasm.sh           # Linux/Mac build script
```

## Troubleshooting

### WASM not loading
1. Check browser console for errors
2. Ensure WASM files are in `public/` directory
3. Rebuild: `npm run build:wasm`

### Build errors
1. Verify Go installation: `go version`
2. Check GOROOT: `go env GOROOT`
3. Ensure you're in project root directory

### Performance issues
1. Browser may throttle Web Workers
2. Disable browser extensions
3. Check available system memory

## Browser Compatibility
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (14+)
- ❌ Internet Explorer (not supported)

## Security
- All hashing occurs locally in the browser
- No file data is sent to any server
- WASM runs in sandboxed environment
- No persistent storage of file data

## Contributing

### Adding New Hash Algorithms
1. Import algorithm in `hasher.go`
2. Add to hashers map
3. Update algorithm selection UI
4. Rebuild WASM

### Extending Functionality
1. Modify `hasher.go` for new features
2. Update TypeScript interfaces
3. Add UI components
4. Test thoroughly

## License
Same as main project

## Future Roadmap

### Phase 2: Batch Processing
- [ ] Folder selection with File System Access API
- [ ] Queue management UI
- [ ] Configurable parallel processing
- [ ] Progress for multiple files

### Phase 3: Advanced Features
- [ ] Hash comparison tool
- [ ] Checksum verification
- [ ] Export results (CSV, JSON)
- [ ] File history/cache

### Phase 4: Performance
- [ ] Web Worker optimization
- [ ] IndexedDB caching
- [ ] Incremental hashing for large files
- [ ] Memory management improvements
