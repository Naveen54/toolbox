import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Building WASM hasher...');

try {
    // Change to wasm directory
    const wasmDir = path.join(__dirname, 'wasm');
    process.chdir(wasmDir);
    
    // Set environment variables and build
    const env = { ...process.env, GOOS: 'js', GOARCH: 'wasm' };
    execSync('go build -o ../public/hasher.wasm hasher.go', { 
        env, 
        stdio: 'inherit' 
    });
    
    // Get Go root
    const goRoot = execSync('go env GOROOT', { encoding: 'utf8' }).trim();
    const wasmExecPath = path.join(goRoot, 'misc', 'wasm', 'wasm_exec.js');
    
    // Copy wasm_exec.js
    if (fs.existsSync(wasmExecPath)) {
        const destPath = path.join(__dirname, 'public', 'wasm_exec.js');
        fs.copyFileSync(wasmExecPath, destPath);
        console.log('WASM build complete!');
        console.log('Files created:');
        console.log('  - public/hasher.wasm');
        console.log('  - public/wasm_exec.js');
    } else {
        console.error('Error: wasm_exec.js not found. Please ensure Go is properly installed.');
        process.exit(1);
    }
    
} catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
}
