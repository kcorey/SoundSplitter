# SoundSplitter

A tool for detecting applause in videos and suggesting split points for video editing.

## Features

- **Applause Detection**: Automatically detects applause segments in video files using FFmpeg
- **Web UI**: Modern, responsive interface for reviewing and managing detected segments
- **Video Playback**: Click on segments to preview the video around applause times
- **Video Splitting**: Extract video segments based on selected applause times
- **Confidence Scoring**: Each detection includes a confidence score
- **Manual Presenter Input**: Enter speaker names via text input
- **Auto-shutdown**: Application closes automatically when browser window is closed

## Requirements

- **FFmpeg**: Must be installed and available in your system PATH
  - **macOS**: `brew install ffmpeg` or download from https://ffmpeg.org/
  - **Linux**: `sudo apt install ffmpeg` (Ubuntu/Debian) or `sudo yum install ffmpeg` (CentOS/RHEL)
  - **Windows**: Download from https://ffmpeg.org/ or install via package manager
  - **Version**: FFmpeg 4.0 or later recommended

## Quick Start (Distribution Version)

1. **Install FFmpeg** (see Requirements above)
2. **Copy the executable** to the same directory as your video files
3. **Run the executable** from that directory, it will automatically open a browser window with the app
4. **Close the browser window** when done - the app will shut down automatically

### Usage

```bash
# Copy to your video directory
cp SoundSplitter /path/to/your/videos/

# Run from the video directory
cd /path/to/your/videos/
./SoundSplitter
```

## Development Setup

### Requirements

- **Go**: Version 1.16 or later
- **FFmpeg**: Must be installed and available in PATH
- **Modern Browser**: Chrome, Firefox, Safari, or Edge

### Installation

1. **Install Go**: Download from [golang.org](https://golang.org/dl/)
2. **Install FFmpeg**: 
   - macOS: `brew install ffmpeg`
   - Ubuntu: `sudo apt install ffmpeg`
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

### Development Usage

#### 1. Analyze Videos

First, run the applause detector on your MOV files:

```bash
go run tools/applause_detector.go
```

This will:
- Find all MOV files in the current directory
- Extract audio and analyze for applause patterns
- Generate JSON analysis files for each video
- Display results in the terminal

#### 2. Start the Web UI

Run the web server:

```bash
go run ui_server.go
```

Then open your browser and navigate to:
```
http://localhost:8080
```

#### 3. Use the Web Interface

The web interface provides:

- **File List**: Shows all analyzed videos with their applause segments
- **Segment Selection**: Checkboxes to select which segments to use for splitting
- **Video Player**: Click on any segment to preview the video
- **Split Button**: Extract video segments based on selected applause times
- **Presenter Tags**: Drag and drop presenter names onto segments
- **Manual Input**: Enter presenter names via text input

## How It Works

### Applause Detection

The system uses FFmpeg's `silencedetect` filter to analyze audio patterns:

1. **Audio Extraction**: Extracts audio from video files using FFmpeg
2. **Volume Analysis**: Detects periods of high activity (non-silence)
3. **Pattern Recognition**: Identifies applause-like patterns (2-20 second duration)
4. **Confidence Scoring**: Assigns confidence based on duration characteristics

### Video Splitting

When you click "Split Videos", the system:

1. **Calculates Segments**: Uses selected applause times to define video segments
2. **Extracts Segments**: Uses FFmpeg to extract video portions
3. **Creates Output Files**: Generates numbered segment files

## File Structure

### Development
```
SoundSplitter/
├── ui_server.go           # Web server for the UI
├── tools/
│   └── applause_detector.go    # Standalone applause detection program
├── index.html             # Web interface
├── app.js                 # Frontend JavaScript
├── *.MOV                  # Your video files
├── *_applause_analysis.json  # Analysis results
└── *_segment_*.mp4       # Generated video segments
```

### Distribution
```
YourVideoDirectory/
├── SoundSplitter          # The executable
├── video1.mp4            # Your video files
├── video2.avi
└── ...                   # Other files
```

## Supported Platforms

- **macOS**: `SoundSplitter` (17MB)
- **Linux**: `SoundSplitter-linux-amd64` (17MB) 
- **Windows**: `SoundSplitter-windows-amd64.exe` (17MB)

## What's Included in Distribution

The executable contains:
- Go server with all dependencies
- Embedded web interface (`index.html`)
- Embedded JavaScript (`app.js`)
- All required Go modules

## API Endpoints

- `GET /api/analyzed-files`: Returns list of analyzed files and segments
- `POST /api/split-video`: Creates video segments
- `GET /api/presenters`: Returns manually entered presenter names
- `GET /api/directory`: Returns list of all files in current directory
- `GET /api/ping`: Health check endpoint
- `GET /videos/{filename}`: Serves video files for playback

## Output Files

### Analysis Files
- `*_applause_analysis.json`: Detailed analysis results
- Contains segment times, durations, and confidence scores
- **Location**: Same directory as the executable

### Video Segments
- `Tag-1.mov`: First video segment (if tags are applied)
- `Tag-2.mov`: Second video segment (if tags are applied)
- `filename_segment_001.mov`: Fallback naming (if no tags)
- **Location**: `extracted/` subdirectory

### Example Directory Structure After Running
```
YourVideoDirectory/
├── SoundSplitter                    # The executable
├── IMG_2333.MOV                     # Original video
├── IMG_2333.MOV_applause_analysis.json  # Analysis results (same directory)
├── extracted/                       # Subdirectory for output files
│   ├── Tag-1.mov                   # Video segments
│   ├── Tag-2.mov
│   ├── extract_videos.sh           # Bash script (if generated)
│   └── ...
└── ...
```

## Using Tags and Presenters

### Adding Presenter Names

1. **Enter Presenter Names**: In the web interface, scroll down to the "Enter Presenter Names" section
2. **Type Names**: Enter names separated by commas (e.g., "Aleesha & George, Patricia, Drew, Liam")
3. **Parse Names**: Click the "Parse Names" button to create draggable tags
4. **Names with "&"**: Will be treated as a single presenter (e.g., "Aleesha & George" becomes one tag)

### Setting the Toastmaster

1. **Find the Toastmaster Drop Zone**: Look for the dashed border area in the presenter tags section
2. **Drag a Presenter**: Drag any presenter tag to the toastmaster drop zone
3. **Apply to All**: Click "Apply to All Segments" to automatically add the toastmaster to every segment

### Adding Tags to Segments

#### Method 1: Drag and Drop onto Major Headers
1. **Find the Video Header**: Each video file has a header with the filename
2. **Drag a Presenter**: Drag any presenter tag onto the video header
3. **First Person**: This sets the default presenter for the first person in that video
4. **All Segments**: This presenter will be applied to all segments in that video

#### Method 2: Drag and Drop onto Individual Segments
1. **Find a Segment**: Each applause segment is shown with start/end times
2. **Drag a Presenter**: Drag any presenter tag onto a specific segment
3. **New Person**: This represents the person who comes on after that applause
4. **Multiple Tags**: You can add multiple presenters to a single segment

### Tag Naming for Output Files

- **Tagged Segments**: Files are named `Tag-1.mov`, `Tag-2.mov`, etc.
- **Untagged Segments**: Files are named `filename_segment_001.mov`, etc.
- **Multiple Tags**: If a segment has multiple tags, the first tag is used for naming

### Custom Tags

1. **Click "Custom Tag"**: In the presenter tags section, click the "Custom Tag" button
2. **Enter Custom Name**: Type in any custom presenter name
3. **Use Like Other Tags**: Drag and drop custom tags just like regular presenter tags

### Tips for Effective Tagging

- **Start with Toastmaster**: Set the toastmaster first, then apply to all segments
- **Tag Major Transitions**: Focus on segments where the main speaker changes
- **Use Consistent Names**: Keep presenter names consistent across all videos
- **Preview Segments**: Click on segments to preview the video before tagging
- **Check Output Names**: The final video files will be named based on your tags

## Troubleshooting

### Common Issues

1. **FFmpeg not found**: Install FFmpeg and ensure it's in your PATH
2. **"Oops! Didn't find any movie files"**: Copy the executable to the directory with your video files
3. **Port already in use**: The app will automatically find an available port
4. **Browser doesn't open**: Manually open `http://localhost:8081` (or the port shown in terminal)
5. **Video won't play**: Ensure video files are in the same directory as the server

### Debug Mode

To save intermediate files for debugging:

```bash
go run tools/applause_detector.go --save-frames
```

This will save frame images used for analysis.

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is open source and available under the MIT License. 