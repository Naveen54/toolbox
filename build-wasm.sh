#!/bin/bash

echo "Building WASM hasher..."

cd wasm

# Build the WASM file
GOOS=js GOARCH=wasm go build -o ../public/hasher.wasm hasher.go

# Copy the wasm_exec.js from Go installation
if [ -f "$(go env GOROOT)/misc/wasm/wasm_exec.js" ]; then
    cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" ../public/
    echo "WASM build complete!"
else
    echo "Error: wasm_exec.js not found. Please ensure Go is properly installed."
    exit 1
fi
