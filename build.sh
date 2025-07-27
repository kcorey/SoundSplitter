#!/bin/bash
echo "Building SoundSplitter for all platforms..."

# Build for macOS (current platform)
echo "Building for macOS..."
go build -o SoundSplitter ui_server.go

# Build for Linux
echo "Building for Linux..."
GOOS=linux GOARCH=amd64 go build -o SoundSplitter-linux-amd64 ui_server.go

# Build for Windows
echo "Building for Windows..."
GOOS=windows GOARCH=amd64 go build -o SoundSplitter-windows-amd64.exe ui_server.go

echo "Build complete!"
echo "Generated binaries:"
echo "  - SoundSplitter (macOS)"
echo "  - SoundSplitter-linux-amd64 (Linux)"
echo "  - SoundSplitter-windows-amd64.exe (Windows)"

echo ""
echo "Copying macOS binary to target directory..."
cp SoundSplitter /Volumes/PS2000W/Toastmasters/20250709/

echo "Done!" 