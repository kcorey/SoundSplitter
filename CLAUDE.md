# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SoundSplitter is a desktop application that analyzes video files for applause segments and provides a web-based UI for reviewing, tagging, and splitting videos based on detected applause patterns. It's designed primarily for Toastmasters meetings where speakers are separated by applause.

## Architecture

- **Backend**: Go server (`ui_server.go`) that handles video analysis, file serving, and FFmpeg operations
- **Frontend**: Vanilla JavaScript (`app.js`) with Bootstrap UI served via embedded files
- **Analysis Tool**: Standalone Go program (`tools/applause_detector.go`) for audio analysis
- **Distribution**: Single executable with embedded web assets

## Development Commands

### Building the Application
```bash
# Build for all platforms
./build.sh

# Build for current platform only
go build -o SoundSplitter ui_server.go

# Build for specific platform
GOOS=linux GOARCH=amd64 go build -o SoundSplitter-linux-amd64 ui_server.go
GOOS=windows GOARCH=amd64 go build -o SoundSplitter-windows-amd64.exe ui_server.go
```

### Running in Development
```bash
# Start the web server
go run ui_server.go

# Run applause detection manually
go run tools/applause_detector.go

# Test applause detection
./test_applause.sh
```

### Dependencies
```bash
# Install Go dependencies
go mod tidy

# Verify FFmpeg is installed (required for video processing)
ffmpeg -version
```

## Key Technical Details

### File Structure
- Main executable works from the directory containing video files
- Creates `extracted/` subdirectory for output video segments
- Generates `*_applause_analysis.json` files for each analyzed video
- Embeds `index.html` and `app.js` using Go's `embed` directive

### FFmpeg Integration
- Uses FFmpeg's `silencedetect` filter for audio analysis
- Extracts audio as temporary WAV files for processing
- Segments videos using `ffmpeg -ss` and `-t` parameters with stream copying
- All FFmpeg operations expect the tool to be in system PATH

### Web Server Architecture
- Automatically finds available port between 8080-8810
- Opens browser automatically on startup
- Auto-shutdown after 5 minutes of inactivity
- Serves video files from current directory via `/videos/` endpoint

### State Management
- Saves UI state to localStorage with file-based validation
- Persists presenter tags and segment selections
- Clears state when video files change
- Includes undo system for segment modifications

### API Endpoints
- `GET /api/analyzed-files` - Returns video analysis results
- `POST /api/split-video` - Extracts video segments using FFmpeg
- `POST /api/parse-presenters` - Parses comma-separated presenter names
- `GET /api/presenters` - Returns presenter list (initially empty)
- `GET /api/toastmaster` - Returns toastmaster designation
- `POST /api/run-detection` - Re-runs applause detection with sensitivity
- `POST /api/save-bash-script` - Saves extraction commands as shell script

## Development Notes

### Testing Video Processing
- Place test video files (MOV, MP4, AVI, MKV, WMV) in the project directory
- Run `go run ui_server.go` to start analysis and web interface
- The server will automatically detect and analyze video files on startup

### Modifying Detection Parameters
- Sensitivity slider in UI maps to FFmpeg `silencedetect` parameters
- Default detection uses `-30dB` noise threshold and `0.1s` minimum duration
- Advanced detection features are calculated from basic FFmpeg output

### Cross-Platform Considerations
- Browser opening logic varies by OS (macOS, Linux, Windows)
- File paths use `filepath.Join` for cross-platform compatibility
- Build script generates platform-specific executables