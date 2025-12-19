#!/bin/bash
# Build WASM modules from published Rust crates
# Note: The Rust crates (hook-transpiler, themed-styler) are published on crates.io.
# During development, WASM modules are pre-built and cached in src/wasm/
# To rebuild from source, install wasm-pack and run: wasm-pack build --target web --release ../../../hook-transpiler

echo "✓ WASM modules cached in src/wasm/"
echo "  To rebuild from crates.io, run:"
echo "    cd ../../../hook-transpiler && wasm-pack build --target web --release --out-dir ../../relay-clients/packages/web/src/wasm"
echo "    cd ../../../themed-styler && wasm-pack build --target web --release --out-dir ../../relay-clients/packages/web/src/wasm"
