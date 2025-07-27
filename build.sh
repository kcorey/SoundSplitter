#!/bin/bash
echo "Building SoundSplitter..."
go build -o SoundSplitter ui_server.go

echo "Copying files to target directory..."
cp SoundSplitter applause_detector /Volumes/PS2000W/Toastmasters/20250709/

echo "Done!" 