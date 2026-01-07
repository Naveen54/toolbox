@echo off
echo Building WASM hasher...

cd wasm

REM Build the WASM file
set GOOS=js
set GOARCH=wasm
go build -o ..\public\hasher.wasm hasher.go

if errorlevel 1 (
    echo Failed to build WASM
    exit /b 1
)

REM Copy the wasm_exec.js from Go installation
for /f "tokens=*" %%i in ('go env GOROOT') do set GOROOT=%%i
copy "%GOROOT%\misc\wasm\wasm_exec.js" ..\public\

if errorlevel 1 (
    echo Error: wasm_exec.js not found. Please ensure Go is properly installed.
    exit /b 1
)

echo WASM build complete!
cd ..
