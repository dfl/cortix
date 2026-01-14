#!/bin/bash
#
# Cortix - WebAssembly Build Script
#
# Usage: ./build-wasm.sh
#
# Requires Emscripten SDK to be installed and activated:
#   source /path/to/emsdk/emsdk_env.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build-wasm"
DIST_DIR="$SCRIPT_DIR/dist"

# Check for emscripten
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please activate Emscripten SDK:"
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

echo "Building Cortix WASM module..."

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$DIST_DIR"

# Configure with CMake
cd "$BUILD_DIR"
emcmake cmake "$SCRIPT_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCORTIX_BUILD_EXAMPLES=OFF \
    -DCORTIX_BUILD_TESTS=OFF

# Build
emmake make -j4

# Copy outputs
cp cortix.js "$DIST_DIR/"
cp cortix.wasm "$DIST_DIR/"

echo ""
echo "Build complete!"
echo "Output files:"
echo "  $DIST_DIR/cortix.js"
echo "  $DIST_DIR/cortix.wasm"
