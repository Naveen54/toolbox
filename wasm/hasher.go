package main

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"hash"
	"syscall/js"
	"time"
	"unsafe"
)

// HashProgress represents the progress of a hashing operation
type HashProgress struct {
	BytesProcessed int64   `json:"bytesProcessed"`
	TotalBytes     int64   `json:"totalBytes"`
	Progress       float64 `json:"progress"`
}

// HashResult represents the final hash results
type HashResult struct {
	MD5    string `json:"md5"`
	SHA1   string `json:"sha1"`
	SHA256 string `json:"sha256"`
	SHA512 string `json:"sha512"`
}

// Global hashers for incremental hashing
var globalHashers map[string]hash.Hash
var globalAlgorithms []string

// Pre-allocated buffer for zero-copy - JS writes directly here
var wasmBuffer []byte
var wasmBufferPtr uintptr

// initHashers initializes hash instances for incremental hashing
func initHashers(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{
			"error": "Expected 1 argument: algorithms array",
		}
	}

	algorithmsJS := args[0]
	globalHashers = make(map[string]hash.Hash)
	globalAlgorithms = make([]string, 0)

	// Parse selected algorithms
	algsLength := algorithmsJS.Length()
	for i := 0; i < algsLength; i++ {
		alg := algorithmsJS.Index(i).String()
		globalAlgorithms = append(globalAlgorithms, alg)

		switch alg {
		case "md5":
			globalHashers["md5"] = md5.New()
		case "sha1":
			globalHashers["sha1"] = sha1.New()
		case "sha256":
			globalHashers["sha256"] = sha256.New()
		case "sha512":
			globalHashers["sha512"] = sha512.New()
		}
	}

	return map[string]interface{}{
		"success": true,
	}
}

// allocateBuffer allocates a buffer in Go's WASM memory and returns the pointer
// JS can then write directly to this memory location
func allocateBuffer(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{
			"error": "Expected 1 argument: buffer size",
		}
	}

	bufferSize := args[0].Int()

	// Allocate buffer in Go's memory
	wasmBuffer = make([]byte, bufferSize)

	// Get the pointer to the buffer's underlying array
	// This points to a location in WASM linear memory
	wasmBufferPtr = uintptr(unsafe.Pointer(&wasmBuffer[0]))

	return map[string]interface{}{
		"success": true,
		"pointer": uint32(wasmBufferPtr),
		"size":    bufferSize,
	}
}

// updateHashersZeroCopy processes data that JS has written directly to WASM memory
// No copy needed - data is already in Go's memory!
func updateHashersZeroCopy(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{
			"error": "Expected 1 argument: data length",
		}
	}

	dataLength := args[0].Int()

	if wasmBuffer == nil || len(wasmBuffer) < dataLength {
		return map[string]interface{}{
			"error": "Buffer not allocated or too small",
		}
	}

	// Write directly to hashers - NO COPY! Data is already in wasmBuffer
	for _, hasher := range globalHashers {
		hasher.Write(wasmBuffer[:dataLength])
	}

	return map[string]interface{}{
		"success": true,
	}
}

// updateHashers processes a chunk of data
func updateHashers(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{
			"error": "Expected 1 argument: data chunk (Uint8Array)",
		}
	}

	// Get the Uint8Array from JavaScript
	dataChunk := args[0]
	dataLength := dataChunk.Get("length").Int()
	data := make([]byte, dataLength)
	var startTime = time.Now()
	js.CopyBytesToGo(data, dataChunk)
	var elapsed = time.Since(startTime)
	fmt.Println(elapsed.Milliseconds())

	// Write to all active hashers
	for key, hasher := range globalHashers {
		var startTime = time.Now()
		hasher.Write(data)
		var elapsed = time.Since(startTime)
		fmt.Printf("%v : %v", key, elapsed.Milliseconds())
	}

	return map[string]interface{}{
		"success": true,
	}
}

// finalizeHashers returns the final hash values
func finalizeHashers(this js.Value, args []js.Value) interface{} {
	result := make(map[string]interface{})

	for alg, hasher := range globalHashers {
		result[alg] = hex.EncodeToString(hasher.Sum(nil))
	}

	// Clear global hashers
	globalHashers = nil
	globalAlgorithms = nil

	return result
}

// progressCallback calls JavaScript callback with progress updates
func progressCallback(callback js.Value, bytesProcessed, totalBytes int64) {
	if !callback.IsNull() && !callback.IsUndefined() {
		progress := float64(bytesProcessed) / float64(totalBytes) * 100.0
		callback.Invoke(map[string]interface{}{
			"bytesProcessed": bytesProcessed,
			"totalBytes":     totalBytes,
			"progress":       progress,
		})
	}
}

// hashFile processes the file data and returns all hash values
func hashFile(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return map[string]interface{}{
			"error": "Expected at least 2 arguments: fileData (Uint8Array) and progressCallback",
		}
	}

	// Get the Uint8Array from JavaScript
	fileData := args[0]
	progressCallbackJS := args[1]

	// Convert Uint8Array to Go byte slice
	dataLength := fileData.Get("length").Int()
	data := make([]byte, dataLength)
	js.CopyBytesToGo(data, fileData)

	// Create hashers
	md5Hasher := md5.New()
	sha1Hasher := sha1.New()
	sha256Hasher := sha256.New()
	sha512Hasher := sha512.New()

	// Process data in chunks for progress reporting
	chunkSize := 1024 * 1024 // 1MB chunks
	totalBytes := int64(len(data))
	var bytesProcessed int64 = 0

	for i := 0; i < len(data); i += chunkSize {
		end := i + chunkSize
		if end > len(data) {
			end = len(data)
		}

		chunk := data[i:end]

		// Write to all hashers
		md5Hasher.Write(chunk)
		sha1Hasher.Write(chunk)
		sha256Hasher.Write(chunk)
		sha512Hasher.Write(chunk)

		bytesProcessed += int64(len(chunk))

		// Report progress
		progressCallback(progressCallbackJS, bytesProcessed, totalBytes)
	}

	// Get final hash values
	result := HashResult{
		MD5:    hex.EncodeToString(md5Hasher.Sum(nil)),
		SHA1:   hex.EncodeToString(sha1Hasher.Sum(nil)),
		SHA256: hex.EncodeToString(sha256Hasher.Sum(nil)),
		SHA512: hex.EncodeToString(sha512Hasher.Sum(nil)),
	}

	// Return result as JS object
	return map[string]interface{}{
		"md5":    result.MD5,
		"sha1":   result.SHA1,
		"sha256": result.SHA256,
		"sha512": result.SHA512,
	}
}

// hashFileStream processes file in streaming fashion for better memory usage
func hashFileStream(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return js.Global().Get("Promise").New(js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			reject := args[1]
			reject.Invoke("Expected 3 arguments: fileHandle, progressCallback, and selectedAlgorithms")
			return nil
		}))
	}

	fileHandle := args[0]
	progressCallbackJS := args[1]
	selectedAlgsJS := args[2]

	// Return a Promise
	promiseConstructor := js.Global().Get("Promise")
	return promiseConstructor.New(js.FuncOf(func(this js.Value, promiseArgs []js.Value) interface{} {
		resolve := promiseArgs[0]
		reject := promiseArgs[1]

		go func() {
			// Get file object
			filePromise := fileHandle.Call("getFile")

			// Create success handler
			successHandler := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				file := args[0]

				// Create FileReader
				reader := js.Global().Get("FileReader").New()

				// Create hashers based on selected algorithms
				hashers := make(map[string]hash.Hash)
				selectedAlgs := make(map[string]bool)

				// Parse selected algorithms
				algsLength := selectedAlgsJS.Length()
				for i := 0; i < algsLength; i++ {
					alg := selectedAlgsJS.Index(i).String()
					selectedAlgs[alg] = true

					switch alg {
					case "md5":
						hashers["md5"] = md5.New()
					case "sha1":
						hashers["sha1"] = sha1.New()
					case "sha256":
						hashers["sha256"] = sha256.New()
					case "sha512":
						hashers["sha512"] = sha512.New()
					}
				}

				// Set up onload handler
				reader.Set("onload", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
					evt := args[0]
					result := evt.Get("target").Get("result")

					// Convert ArrayBuffer to Uint8Array
					uint8Array := js.Global().Get("Uint8Array").New(result)
					dataLength := uint8Array.Get("length").Int()
					data := make([]byte, dataLength)
					js.CopyBytesToGo(data, uint8Array)

					// Process data in chunks
					chunkSize := 1024 * 1024 // 1MB chunks
					totalBytes := int64(len(data))
					var bytesProcessed int64 = 0

					for i := 0; i < len(data); i += chunkSize {
						end := i + chunkSize
						if end > len(data) {
							end = len(data)
						}

						chunk := data[i:end]

						// Write to all selected hashers
						for _, hasher := range hashers {
							hasher.Write(chunk)
						}

						bytesProcessed += int64(len(chunk))

						// Report progress
						progressCallback(progressCallbackJS, bytesProcessed, totalBytes)
					}

					// Get final hash values
					results := make(map[string]interface{})
					for alg, hasher := range hashers {
						results[alg] = hex.EncodeToString(hasher.Sum(nil))
					}

					resolve.Invoke(results)
					return nil
				}))

				// Set up onerror handler
				reader.Set("onerror", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
					reject.Invoke("Failed to read file")
					return nil
				}))

				// Read file as ArrayBuffer
				reader.Call("readAsArrayBuffer", file)

				return nil
			})

			// Create error handler
			errorHandler := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				reject.Invoke("Failed to get file handle")
				return nil
			})

			// Attach then/catch
			filePromise.Call("then", successHandler).Call("catch", errorHandler)
		}()

		return nil
	}))
}

func main() {
	c := make(chan struct{})

	fmt.Println("Go WASM Hasher initialized")

	// Register functions
	js.Global().Set("goHashFile", js.FuncOf(hashFile))
	js.Global().Set("goHashFileStream", js.FuncOf(hashFileStream))

	// Register incremental hashing functions for large files
	js.Global().Set("goInitHashers", js.FuncOf(initHashers))
	js.Global().Set("goUpdateHashers", js.FuncOf(updateHashers))
	js.Global().Set("goFinalizeHashers", js.FuncOf(finalizeHashers))

	// Register zero-copy functions - JS writes directly to WASM memory
	js.Global().Set("goAllocateBuffer", js.FuncOf(allocateBuffer))
	js.Global().Set("goUpdateHashersZeroCopy", js.FuncOf(updateHashersZeroCopy))

	<-c
}
