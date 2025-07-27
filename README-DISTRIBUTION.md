# SoundSplitter - Standalone Executable

## Quick Start

1. **Copy the executable** to the same directory as your video files
2. **Run the executable** from that directory
3. **Open your browser** - it will automatically open to the app
4. **Close the browser window** when done - the app will shut down automatically

## Usage

```bash
# Copy to your video directory
cp SoundSplitter /path/to/your/videos/

# Run from the video directory
cd /path/to/your/videos/
./SoundSplitter
```

## What It Does

- ✅ **Automatically detects** video files (.mp4, .avi, .mov, .mkv, .wmv)
- ✅ **Runs applause detection** on video files (even if no analysis files exist)
- ✅ **Extracts speaker names** from PDF schedules
- ✅ **Provides web interface** for splitting videos at applause points
- ✅ **Auto-shutdown** when browser window closes
- ✅ **Cache prevention** - always loads the latest version of the web interface

## Supported Platforms

- **macOS**: `SoundSplitter` (17MB)
- **Linux**: `SoundSplitter-linux-amd64` (17MB) 
- **Windows**: `SoundSplitter-windows-amd64.exe` (17MB)

## What's Included

The executable contains:
- Go server with all dependencies
- Embedded web interface (`index.html`)
- Embedded JavaScript (`app.js`)
- UniPDF library for PDF parsing
- All required Go modules

## Requirements

- **No installation needed** - just copy and run
- **No dependencies** - everything is bundled (including web interface)
- **Works offline** - no internet required
- **Cross-platform** - works on macOS, Linux, Windows
- **Self-contained** - web interface is embedded in the executable

## File Structure

```
YourVideoDirectory/
├── SoundSplitter          # The executable
├── video1.mp4            # Your video files
├── video2.avi
├── schedule.pdf          # Optional PDF schedule
└── ...                   # Other files
```

## How It Works

1. **Starts web server** on available port (8080-8810)
2. **Automatically processes** video files and PDFs in the directory
3. **Runs applause detection** on video files (if not already done)
4. **Extracts speaker names** from PDF schedules (if not already done)
5. **Opens browser** automatically with results
6. **Auto-shutdown** when browser closes
7. **Smart processing** - if no analysis files exist but video files are found, automatically runs applause detection
8. **Cache prevention** - ensures the latest version of the web interface is always loaded

## API Endpoints

- `/api/analyzed-files` - Returns list of processed video files
- `/api/presenters` - Returns extracted speaker names from PDFs
- `/api/toastmaster` - Returns detected toastmaster information
- `/api/directory` - Returns list of all files in current directory
- `/api/ping` - Health check endpoint

## Troubleshooting

- **"Oops! Didn't find any movie files"** → Copy the executable to the directory with your video files
- **Port already in use** → The app will automatically find an available port
- **Browser doesn't open** → Manually open `http://localhost:8081` (or the port shown in terminal)

## PDF License (Optional)

For full PDF parsing capabilities:
1. Get free trial license from https://unidoc.io
2. Set environment variables:
   ```bash
   export UNIPDF_LICENSE_KEY='your-license-key'
   export UNIPDF_CUSTOMER_NAME='your-customer-name'
   ```

Without license, PDF parsing will be limited but still functional. 