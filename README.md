# SoundSplitter

A tool for detecting applause in videos and suggesting split points for video editing.

## Features

- **Applause Detection**: Automatically detects applause segments in video files
- **Web UI**: Modern, responsive interface for reviewing and managing detected segments
- **Video Playback**: Click on segments to preview the video around applause times
- **Video Splitting**: Extract video segments based on selected applause times
- **Confidence Scoring**: Each detection includes a confidence score

## Quick Start

### 1. Analyze Videos

First, run the applause detector on your MOV files:

```bash
go run applause_detector.go
```

This will:
- Find all MOV files in the current directory
- Extract audio and analyze for applause patterns
- Generate JSON analysis files for each video
- Display results in the terminal

### 2. Start the Web UI

Run the web server:

```bash
go run ui_server.go
```

Then open your browser and navigate to:
```
http://localhost:8080
```

### 3. Use the Web Interface

The web interface provides:

- **File List**: Shows all analyzed videos with their applause segments
- **Segment Selection**: Checkboxes to select which segments to use for splitting
- **Video Player**: Click on any segment to preview the video
- **Split Button**: Extract video segments based on selected applause times

## How It Works

### Applause Detection

The system uses FFmpeg's `silencedetect` filter to analyze audio patterns:

1. **Audio Extraction**: Extracts audio from video files
2. **Volume Analysis**: Detects periods of high activity (non-silence)
3. **Pattern Recognition**: Identifies applause-like patterns (2-20 second duration)
4. **Confidence Scoring**: Assigns confidence based on duration characteristics

### Video Splitting

When you click "Split Videos", the system:

1. **Calculates Segments**: Uses selected applause times to define video segments
2. **Extracts Segments**: Uses FFmpeg to extract video portions
3. **Creates Output Files**: Generates numbered segment files

## File Structure

```
SoundSplitter/
├── applause_detector.go    # Main applause detection program
├── ui_server.go           # Web server for the UI
├── index.html             # Web interface
├── app.js                 # Frontend JavaScript
├── *.MOV                  # Your video files
├── *_applause_analysis.json  # Analysis results
└── *_segment_*.mp4       # Generated video segments
```

## Requirements

- **Go**: Version 1.16 or later
- **FFmpeg**: Must be installed and available in PATH
- **Modern Browser**: Chrome, Firefox, Safari, or Edge

## Installation

1. **Install Go**: Download from [golang.org](https://golang.org/dl/)
2. **Install FFmpeg**: 
   - macOS: `brew install ffmpeg`
   - Ubuntu: `sudo apt install ffmpeg`
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Usage Examples

### Basic Analysis

```bash
# Analyze all MOV files in current directory
go run applause_detector.go
```

### Web Interface

```bash
# Start the web server
go run ui_server.go

# Open browser to http://localhost:8080
```

### Custom Analysis

The applause detector supports several options:

```bash
# Show help
go run applause_detector.go --help

# Save comparison frames (for debugging)
go run applause_detector.go --save-frames
```

## Output Files

### Analysis Files
- `*_applause_analysis.json`: Detailed analysis results
- Contains segment times, durations, and confidence scores

### Video Segments
- `*_segment_001.mp4`: First video segment
- `*_segment_002.mp4`: Second video segment
- etc.

## Troubleshooting

### Common Issues

1. **FFmpeg not found**: Install FFmpeg and ensure it's in your PATH
2. **No MOV files found**: Ensure your video files have .MOV extension
3. **Server won't start**: Check if port 8080 is already in use
4. **Video won't play**: Ensure video files are in the same directory as the server

### Debug Mode

To save intermediate files for debugging:

```bash
go run applause_detector.go --save-frames
```

This will save frame images used for analysis.

## API Endpoints

The web server provides these API endpoints:

- `GET /api/analyzed-files`: Returns list of analyzed files and segments
- `POST /api/split-video`: Creates video segments
- `GET /videos/{filename}`: Serves video files for playback

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is open source and available under the MIT License. 