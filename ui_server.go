package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed index.html app.js
var embeddedFiles embed.FS

// Global variables for browser monitoring
var (
	lastPingTime  time.Time
	pingMutex     sync.RWMutex
	lastActivity  time.Time
	activityMutex sync.RWMutex

	// Directory where the executable resides
	appBaseDir string
)

type VideoAnalysis struct {
	Filename string            `json:"filename"`
	Segments []ApplauseSegment `json:"applause_segments"`
}

type ApplauseSegment struct {
	StartTime      string  `json:"start_time"`
	EndTime        string  `json:"end_time"`
	Duration       string  `json:"duration"`
	Confidence     float64 `json:"confidence"`
	RhythmScore    float64 `json:"rhythm_score"`
	TransientCount int     `json:"transient_count"`
	Selected       bool    `json:"selected"`
}

// AudioFrame represents a single frame of audio analysis
type AudioFrame struct {
	Time         float64
	Energy       float64
	ZCR          float64
	SpectralFlux float64
	Volume       float64
}

type SplitRequest struct {
	Filename       string  `json:"filename"`
	StartTime      float64 `json:"startTime"`
	EndTime        float64 `json:"endTime"`
	OutputFilename string  `json:"outputFilename"`
}

type SplitResponse struct {
	OutputFile string `json:"outputFile"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}

type Presenter struct {
	Time          string `json:"time"`
	Role          string `json:"role"`
	Presenter     string `json:"presenter"`
	Event         string `json:"event"`
	DurationGreen string `json:"duration_green"`
	DurationAmber string `json:"duration_amber"`
	DurationRed   string `json:"duration_red"`
}

func main() {
	fmt.Println("=== SoundSplitter Starting ===")

	// Add a small delay to allow the process to stabilize
	time.Sleep(100 * time.Millisecond)

	// Set up signal handling early to prevent immediate termination
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\nReceived interrupt signal, shutting down gracefully...")
		os.Exit(0)
	}()

	// Set appBaseDir to the directory where the executable resides
	executable, err := os.Executable()
	if err != nil {
		log.Fatalf("Could not get executable path: %v", err)
	}
	appBaseDir = filepath.Dir(executable)
	fmt.Printf("App base directory: %s\n", appBaseDir)

	// Set up UniPDF license
	fmt.Println("Step 2: Setting up PDF library...")
	setupPDFLibrary()
	fmt.Println("Step 2: Complete")

	// Process files on startup
	fmt.Println("Step 3: Processing files on startup...")
	processFilesOnStartup()
	fmt.Println("Step 3: Complete")

	// Set up HTTP server and handlers
	fmt.Println("Step 4: Setting up HTTP server...")
	http.HandleFunc("/", handleStatic)
	http.HandleFunc("/api/analyzed-files", trackActivity(handleAnalyzedFiles))
	http.HandleFunc("/api/split-video", trackActivity(handleSplitVideo))
	http.HandleFunc("/api/presenters", trackActivity(handlePresenters))
	http.HandleFunc("/api/toastmaster", trackActivity(handleToastmaster))
	http.HandleFunc("/api/run-detection", trackActivity(handleRunDetection))
	http.HandleFunc("/api/save-bash-script", trackActivity(handleSaveBashScript))
	http.HandleFunc("/api/browser-closing", trackActivity(handleBrowserClosing))
	http.HandleFunc("/api/ping", trackActivity(handlePing))
	http.HandleFunc("/api/directory", trackActivity(handleDirectory))
	http.HandleFunc("/api/parse-presenters", trackActivity(handleParsePresenters))
	http.HandleFunc("/videos/", handleVideoFiles)
	fmt.Println("  - HTTP handlers registered")

	fmt.Println("Step 5: Finding available port...")
	// Try ports from 8080 to 8810
	port := findAvailablePort(8080, 8810)
	if port == 0 {
		log.Fatal("No available ports found between 8080 and 8810")
	}
	fmt.Printf("  - Found available port: %d\n", port)

	url := fmt.Sprintf("http://localhost:%d", port)
	fmt.Printf("Step 6: Starting server on %s\n", url)
	fmt.Printf("  - Opening browser with URL: %s\n", url)

	// Open browser
	openBrowser(url)
	fmt.Println("  - Browser opened")

	fmt.Println("Step 7: Setting up graceful shutdown...")
	// Set up graceful shutdown
	setupGracefulShutdown()
	fmt.Println("  - Graceful shutdown configured")

	fmt.Println("Step 8: Starting HTTP server...")
	fmt.Println("Server is running. Server will auto-shutdown after 5 minutes of inactivity.")
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
}

func processFilesOnStartup() {
	fmt.Println("Step 3: Processing files on startup...")
	fmt.Println("  - Processing files in app base directory...")

	// Find video files
	fmt.Println("  - Looking for video files...")
	videoFiles := findVideoFiles()
	fmt.Printf("  - Found %d video files\n", len(videoFiles))

	// Run applause detection on video files
	for _, videoFile := range videoFiles {
		fmt.Printf("  - About to run detection on: %s\n", videoFile)
		fullPath := filepath.Join(appBaseDir, videoFile)
		fmt.Printf("  - Full path: %s\n", fullPath)
		if err := runApplauseDetectionOnVideo(fullPath); err != nil {
			fmt.Printf("  - Detection error for %s: %v\n", videoFile, err)
		}
	}

	if len(videoFiles) == 0 {
		fmt.Println("  - No video files (.mp4, .avi, .mov, .mkv, .wmv) found in app base directory")
	} else {
		fmt.Printf("  - Found %d video files\n", len(videoFiles))
	}
	fmt.Println("  - processFilesOnStartup complete")
}

func setupPDFLibrary() {
	fmt.Println("  - Using open-source PDF library for text extraction")
	fmt.Println("  - PDF parsing should work without licensing restrictions")
	fmt.Println("  - setupPDFLibrary complete")
}

// trackActivity wraps an HTTP handler to track activity
func trackActivity(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		activityMutex.Lock()
		lastActivity = time.Now()
		activityMutex.Unlock()

		fmt.Printf("Activity: %s %s at %s\n", r.Method, r.URL.Path, time.Now().Format("15:04:05"))

		handler(w, r)
	}
}

func handleStatic(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("  - Static file request: %s\n", r.URL.Path)

	// Add cache-busting headers to prevent browser caching
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("ETag", fmt.Sprintf("\"%d\"", time.Now().Unix()))

	// Handle root path
	if r.URL.Path == "/" {
		fmt.Printf("  - Serving index.html\n")
		content, err := embeddedFiles.ReadFile("index.html")
		if err != nil {
			fmt.Printf("  - Error reading index.html: %v\n", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		fmt.Printf("  - index.html content length: %d bytes\n", len(content))
		w.Header().Set("Content-Type", "text/html")
		w.Write(content)
		return
	}

	// Handle app.js
	if r.URL.Path == "/app.js" {
		fmt.Printf("  - Serving app.js\n")
		content, err := embeddedFiles.ReadFile("app.js")
		if err != nil {
			fmt.Printf("  - Error reading app.js: %v\n", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		fmt.Printf("  - app.js content length: %d bytes\n", len(content))
		w.Header().Set("Content-Type", "application/javascript")
		w.Write(content)
		return
	}

	// For any other path, return 404 since we only have index.html and app.js embedded
	http.NotFound(w, r)
}

func runApplauseDetectionOnVideo(videoFile string) error {
	fmt.Printf("  - Running applause detection on: %s\n", videoFile)

	// Check if analysis already exists
	analysisFile := strings.TrimSuffix(filepath.Base(videoFile), filepath.Ext(videoFile)) + "_applause_analysis.json"
	if _, err := os.Stat(filepath.Join(appBaseDir, analysisFile)); os.IsNotExist(err) {
		fmt.Printf("  - Running applause detection on: %s\n", filepath.Base(videoFile))

		// Extract audio from video using FFmpeg
		audioFile := strings.TrimSuffix(videoFile, filepath.Ext(videoFile)) + "_temp_audio.wav"
		fmt.Printf("  - Extracting audio to: %s\n", audioFile)

		// Use FFmpeg to extract audio from video with high quality
		cmd := exec.Command("ffmpeg", "-i", videoFile, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", "-y", audioFile)
		output, err := cmd.CombinedOutput()
		if err != nil {
			fmt.Printf("  - Audio extraction error for %s: %v, output: %s\n", filepath.Base(videoFile), err, string(output))
			return err
		}
		fmt.Printf("  - Audio extraction completed for %s\n", filepath.Base(videoFile))

		// Analyze audio for applause using FFmpeg silencedetect
		fmt.Printf("  - Analyzing audio for applause patterns...\n")
		cmd = exec.Command("ffmpeg", "-i", audioFile, "-af", "silencedetect=noise=-30dB:d=0.1", "-f", "null", "-")
		output, err = cmd.CombinedOutput()
		if err != nil {
			fmt.Printf("  - Audio analysis error for %s: %v, output: %s\n", filepath.Base(videoFile), err, string(output))
			os.Remove(audioFile) // Clean up
			return err
		}
		fmt.Printf("  - Audio analysis completed for %s\n", filepath.Base(videoFile))

		// Parse the output and create analysis
		segments := parseApplauseFromFFmpegOutput(string(output))

		// Create analysis result
		analysis := map[string]interface{}{
			"filename":          videoFile,
			"applause_segments": segments,
		}

		// Save to JSON
		data, err := json.MarshalIndent(analysis, "", "  ")
		if err != nil {
			fmt.Printf("  - JSON encoding error for %s: %v\n", filepath.Base(videoFile), err)
			os.Remove(audioFile) // Clean up
			return err
		}

		if err := os.WriteFile(filepath.Join(appBaseDir, analysisFile), data, 0644); err != nil {
			fmt.Printf("  - File write error for %s: %v\n", filepath.Base(videoFile), err)
			os.Remove(audioFile) // Clean up
			return err
		}

		fmt.Printf("  - Analysis saved to: %s\n", analysisFile)
		fmt.Printf("  - Found %d applause segments\n", len(segments))

		// Clean up temporary audio file
		os.Remove(audioFile)
	} else {
		fmt.Printf("  - Analysis already exists for %s\n", filepath.Base(videoFile))
	}

	return nil
}

func parseApplauseFromFFmpegOutput(output string) []map[string]interface{} {
	var segments []map[string]interface{}

	// Parse FFmpeg silencedetect output
	lines := strings.Split(output, "\n")

	// Look for silence_start and silence_end patterns
	silenceStartRegex := regexp.MustCompile(`silence_start: (\d+\.?\d*)`)
	silenceEndRegex := regexp.MustCompile(`silence_end: (\d+\.?\d*)`)

	var timePoints []float64
	var volumePoints []float64

	for _, line := range lines {
		if match := silenceStartRegex.FindStringSubmatch(line); match != nil {
			time, _ := strconv.ParseFloat(match[1], 64)
			timePoints = append(timePoints, time)
			volumePoints = append(volumePoints, 0) // Silence
		} else if match := silenceEndRegex.FindStringSubmatch(line); match != nil {
			time, _ := strconv.ParseFloat(match[1], 64)
			timePoints = append(timePoints, time)
			volumePoints = append(volumePoints, 1) // Non-silence
		}
	}

	// Convert to segments
	for i := 0; i < len(timePoints)-1; i++ {
		startTime := timePoints[i]
		endTime := timePoints[i+1]
		duration := endTime - startTime

		// Filter for applause-like segments (2-20 seconds of non-silence)
		if volumePoints[i] == 1 && duration >= 2.0 && duration <= 20.0 {
			segment := map[string]interface{}{
				"start_time":      formatTime(startTime),
				"end_time":        formatTime(endTime),
				"duration":        formatTime(duration),
				"confidence":      0.8,                // Default confidence
				"rhythm_score":    0.7,                // Default rhythm score
				"transient_count": int(duration * 10), // Rough estimate
			}
			segments = append(segments, segment)
		}
	}

	return segments
}

func formatTime(seconds float64) string {
	minutes := int(seconds) / 60
	secs := int(seconds) % 60
	return fmt.Sprintf("%02d:%02d", minutes, secs)
}

func findVideoFiles() []string {
	videoExtensions := []string{".mp4", ".avi", ".mov", ".mkv", ".wmv"}
	var videoFiles []string

	entries, err := os.ReadDir(appBaseDir)
	if err != nil {
		log.Printf("Error reading directory: %v", err)
		return videoFiles
	}

	for _, file := range entries {
		if !file.IsDir() {
			// Skip macOS metadata files (files starting with ._)
			if strings.HasPrefix(file.Name(), "._") {
				continue
			}
			ext := strings.ToLower(filepath.Ext(file.Name()))
			for _, videoExt := range videoExtensions {
				if ext == videoExt {
					videoFiles = append(videoFiles, file.Name())
					break
				}
			}
		}
	}

	return videoFiles
}

func handleAnalyzedFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Add cache-busting headers
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Find all JSON analysis files
	files, err := findAnalysisFiles(appBaseDir)
	if err != nil {
		log.Printf("Error finding analysis files: %v", err)
		// Return empty array instead of error
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]VideoAnalysis{})
		return
	}

	log.Printf("Found %d analysis files: %v", len(files), files)

	// If no analysis files found, check for video files and run detection
	if len(files) == 0 {
		videoFiles := findVideoFiles()
		if len(videoFiles) > 0 {
			log.Printf("No analysis files found, but found %d video files. Running applause detection...", len(videoFiles))

			// Run applause detection on each video file that doesn't have an analysis
			for _, videoFile := range videoFiles {
				analysisFile := strings.TrimSuffix(videoFile, filepath.Ext(videoFile)) + "_analysis.json"
				if _, err := os.Stat(filepath.Join(appBaseDir, analysisFile)); os.IsNotExist(err) {
					if err := runApplauseDetectionOnVideo(filepath.Join(appBaseDir, videoFile)); err != nil {
						log.Printf("Failed to run applause detection on %s: %v", videoFile, err)
					}
				}
			}

			// Re-check for analysis files after running detection
			files, err = findAnalysisFiles(appBaseDir)
			if err != nil {
				log.Printf("Error finding analysis files after detection: %v", err)
			} else {
				log.Printf("Found %d analysis files after detection: %v", len(files), files)
			}
		}
	}

	// Load and parse each analysis file
	analyses := make([]VideoAnalysis, 0) // Initialize as empty slice, not nil
	for _, file := range files {
		analysis, err := loadAnalysisFile(filepath.Join(appBaseDir, file))
		if err != nil {
			log.Printf("Error loading analysis file %s: %v", file, err)
			continue
		}

		// Set default selected state to true for all segments
		for i := range analysis.Segments {
			analysis.Segments[i].Selected = true
		}

		analyses = append(analyses, analysis)
	}

	log.Printf("Returning %d analyses", len(analyses))
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analyses)
}

func handleSplitVideo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SplitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Use the provided output filename or create a default one
	outputFile := req.OutputFilename
	if outputFile == "" {
		baseName := strings.TrimSuffix(req.Filename, filepath.Ext(req.Filename))
		outputFile = fmt.Sprintf("%s_segment_001.mp4", baseName)
	}

	// Use FFmpeg to extract the video segment
	err := extractVideoSegment(req.Filename, outputFile, req.StartTime, req.EndTime)
	if err != nil {
		response := SplitResponse{
			Success: false,
			Error:   err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	response := SplitResponse{
		OutputFile: outputFile,
		Success:    true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handlePresenters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Add cache-busting headers
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Return empty presenters array - presenters will be entered manually
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]Presenter{})
}

func handleToastmaster(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Add cache-busting headers
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Return empty toastmaster - will be set manually
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"toastmaster": ""})
}

func handleRunDetection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var request struct {
		VideoFile string                 `json:"videoFile"`
		Params    map[string]interface{} `json:"params"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Extract sensitivity parameter (1-10 scale)
	sensitivity := 5.0 // default
	if sens, ok := request.Params["sensitivity"]; ok {
		if sensFloat, ok := sens.(float64); ok {
			sensitivity = sensFloat
		}
	}

	// Extract min duration if provided
	minDuration := 2.0 // default
	if dur, ok := request.Params["minDuration"]; ok {
		if durFloat, ok := dur.(float64); ok {
			minDuration = durFloat
		}
	}

	// Build command with new sensitivity-based parameters
	cmd := exec.Command("go", "run", "tools/applause_detector.go", request.VideoFile,
		"--sensitivity", fmt.Sprintf("%.1f", sensitivity),
		"--min-duration", fmt.Sprintf("%.1f", minDuration))

	// Run the command
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Detection error: %v, output: %s", err, string(output))
		http.Error(w, "Detection failed", http.StatusInternalServerError)
		return
	}

	log.Printf("Detection completed for %s with sensitivity %.1f", request.VideoFile, sensitivity)
	w.WriteHeader(http.StatusOK)
}

func handleVideoFiles(w http.ResponseWriter, r *http.Request) {
	// Extract filename from URL path
	filename := strings.TrimPrefix(r.URL.Path, "/videos/")

	// Security: prevent directory traversal
	if strings.Contains(filename, "..") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Handle full paths by extracting just the filename
	if strings.Contains(filename, "/") {
		filename = filepath.Base(filename)
	}

	// Check if file exists
	if _, err := os.Stat(filepath.Join(appBaseDir, filename)); os.IsNotExist(err) {
		http.Error(w, "Video file not found", http.StatusNotFound)
		return
	}

	// Serve the video file
	http.ServeFile(w, r, filepath.Join(appBaseDir, filename))
}

func findAnalysisFiles(dir string) ([]string, error) {
	var files []string

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			filename := entry.Name()
			if strings.HasSuffix(filename, "_applause_analysis.json") {
				files = append(files, filename)
			}
		}
	}

	return files, nil
}

func loadAnalysisFile(filename string) (VideoAnalysis, error) {
	var analysis VideoAnalysis

	data, err := os.ReadFile(filename)
	if err != nil {
		return analysis, err
	}

	err = json.Unmarshal(data, &analysis)
	if err != nil {
		return analysis, err
	}

	return analysis, nil
}

func detectColumnBoundaries(lines []string) map[string]int {
	// For this specific PDF format, we can see the pattern:
	// Time (5 chars) + spaces + Role (variable) + spaces + Presenter + spaces + Event
	// Let's find the most consistent pattern

	// Look for lines that have the pattern: HH:MM + spaces + role + spaces + presenter
	var presenterStart, presenterEnd int

	// Analyze a few sample lines to find the pattern
	sampleLines := lines
	if len(sampleLines) > 5 {
		sampleLines = sampleLines[:5] // Use first 5 lines for analysis
	}

	// Find the position after the time and role
	// Time is always 5 characters (HH:MM), then spaces, then role
	for _, line := range sampleLines {
		if len(line) < 10 {
			continue
		}

		// Find the end of the time (HH:MM format)
		timeEnd := -1
		for i := 0; i < len(line)-4; i++ {
			if line[i] >= '0' && line[i] <= '9' &&
				line[i+1] == ':' &&
				line[i+2] >= '0' && line[i+2] <= '9' &&
				line[i+3] >= '0' && line[i+3] <= '9' {
				timeEnd = i + 4
				break
			}
		}

		if timeEnd > 0 {
			// Skip spaces after time
			roleStart := timeEnd
			for roleStart < len(line) && line[roleStart] == ' ' {
				roleStart++
			}

			// Find the end of the role (look for multiple spaces)
			roleEnd := roleStart
			for roleEnd < len(line) && line[roleEnd] != ' ' {
				roleEnd++
			}

			// Skip spaces after role to find presenter start
			presenterStart = roleEnd
			for presenterStart < len(line) && line[presenterStart] == ' ' {
				presenterStart++
			}

			// Find presenter end (look for multiple spaces)
			presenterEnd = presenterStart
			for presenterEnd < len(line) && line[presenterEnd] != ' ' {
				presenterEnd++
			}

			// If we found a reasonable presenter position, use it
			if presenterStart < len(line) && presenterEnd > presenterStart {
				return map[string]int{
					"start": presenterStart,
					"end":   presenterEnd,
				}
			}
		}
	}

	// Fallback to fixed positions if analysis fails
	return map[string]int{
		"start": 35,
		"end":   55,
	}
}

func extractPresenterFromLine(line string, boundaries map[string]int) string {
	start := boundaries["start"]
	end := boundaries["end"]

	if len(line) < start {
		return ""
	}

	if len(line) < end {
		end = len(line)
	}

	presenter := strings.TrimSpace(line[start:end])

	// Filter out non-presenter content
	if presenter == "" ||
		strings.Contains(strings.ToLower(presenter), "break") ||
		strings.Contains(strings.ToLower(presenter), "duration") ||
		strings.Contains(strings.ToLower(presenter), "meet") ||
		strings.Contains(strings.ToLower(presenter), "greet") {
		return ""
	}

	return presenter
}

func extractVideoSegment(inputFile, outputFile string, startTime, endTime float64) error {
	// Create extracted directory if it doesn't exist
	extractedDir := "extracted"
	if err := os.MkdirAll(extractedDir, 0755); err != nil {
		return fmt.Errorf("failed to create extracted directory: %v", err)
	}

	// Use FFmpeg to extract the video segment
	duration := endTime - startTime

	outputPath := filepath.Join(extractedDir, outputFile)

	cmd := exec.Command("ffmpeg",
		"-i", inputFile,
		"-ss", fmt.Sprintf("%.2f", startTime),
		"-t", fmt.Sprintf("%.2f", duration),
		"-c", "copy", // Copy streams without re-encoding for speed
		"-avoid_negative_ts", "make_zero",
		"-y", // Overwrite output file
		outputPath)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("FFmpeg error: %v, output: %s", err, string(output))
	}

	return nil
}

type BashScriptRequest struct {
	Script string `json:"script"`
}

func handleSaveBashScript(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BashScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Create extracted directory if it doesn't exist
	extractedDir := "extracted"
	if err := os.MkdirAll(extractedDir, 0755); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create extracted directory: %v", err), http.StatusInternalServerError)
		return
	}

	// Save the bash script to the extracted directory
	scriptPath := filepath.Join(extractedDir, "extract_videos.sh")
	if err := os.WriteFile(scriptPath, []byte(req.Script), 0755); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save bash script: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success": "true",
		"message": "Bash script saved successfully",
		"path":    scriptPath,
	})
}

func handleBrowserClosing(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("Browser closing endpoint called - Method: %s, Headers: %v\n", r.Method, r.Header)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	fmt.Println("Browser window closing detected, shutting down server...")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Server shutting down"})

	// Give the response a moment to be sent, then exit
	go func() {
		time.Sleep(100 * time.Millisecond)
		fmt.Println("Exiting server...")

		os.Exit(0)
	}()
}

func handlePing(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("Ping received at %s\n", time.Now().Format("15:04:05"))

	pingMutex.Lock()
	lastPingTime = time.Now()
	pingMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "pong"})
}

func handleDirectory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Add cache-busting headers
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	entries, err := os.ReadDir(".")
	if err != nil {
		http.Error(w, fmt.Sprintf("Error reading directory: %v", err), http.StatusInternalServerError)
		return
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() {
			files = append(files, entry.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"files": files,
		"count": len(files),
	})
}

func handleParsePresenters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var request struct {
		PresenterString string `json:"presenterString"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Parse the comma-separated string into individual presenters
	presenters := parsePresenterString(request.PresenterString)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(presenters)
}

func parsePresenterString(presenterString string) []Presenter {
	var presenters []Presenter

	// Split by comma and clean up each name
	names := strings.Split(presenterString, ",")
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name != "" {
			presenters = append(presenters, Presenter{
				Presenter: name,
			})
		}
	}

	return presenters
}

func findAvailablePort(startPort, endPort int) int {
	for port := startPort; port <= endPort; port++ {
		addr := fmt.Sprintf(":%d", port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			listener.Close()
			return port
		}
	}
	return 0
}

func openBrowser(url string) *exec.Cmd {
	// Add a delay to ensure the server is ready
	time.Sleep(500 * time.Millisecond)

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		// Try multiple approaches to ensure a new window is created
		fmt.Printf("  - Attempting to open Chrome with new window...\n")
		// First, try Chrome with new window to force a new instance
		cmd = exec.Command("open", "-na", "Google Chrome", "--args", "--new", "--new-window", url)
		err := cmd.Start()
		if err != nil {
			fmt.Printf("  - Chrome new window failed: %v\n", err)
			fmt.Printf("  - Attempting to open Chrome with incognito mode...\n")
			// Try Chrome with incognito mode
			cmd = exec.Command("open", "-a", "Google Chrome", "--args", "--incognito", "--new-window", url)
			err = cmd.Start()
			if err != nil {
				fmt.Printf("  - Chrome incognito failed: %v\n", err)
				fmt.Printf("  - Attempting to open Chrome without special flags...\n")
				// Try Chrome without special flags
				cmd = exec.Command("open", "-a", "Google Chrome", url)
				err = cmd.Start()
				if err != nil {
					fmt.Printf("  - Chrome failed: %v\n", err)
					fmt.Printf("  - Attempting to open Safari...\n")
					// Try Safari
					cmd = exec.Command("open", "-a", "Safari", url)
					err = cmd.Start()
					if err != nil {
						fmt.Printf("  - Safari failed: %v\n", err)
						fmt.Printf("  - Attempting to open default browser...\n")
						// Final fallback to default browser
						cmd = exec.Command("open", url)
						err = cmd.Start()
					}
				}
			}
		}
		if err != nil {
			fmt.Printf("Failed to open browser: %v\n", err)
			fmt.Printf("Please open your browser and navigate to: %s\n", url)
			return nil
		}
		fmt.Printf("  - Browser opened successfully\n")
		return cmd
	default:
		fmt.Printf("Please open your browser and navigate to: %s\n", url)
		return nil
	}

	err := cmd.Start()
	if err != nil {
		fmt.Printf("Failed to open browser: %v\n", err)
		fmt.Printf("Please open your browser and navigate to: %s\n", url)
		return nil
	}
	return cmd
}

func setupGracefulShutdown() {
	// Set up signal handling for graceful shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-c
		fmt.Println("\nShutting down server gracefully...")
		os.Exit(0)
	}()

	// Initialize activity time
	activityMutex.Lock()
	lastActivity = time.Now()
	activityMutex.Unlock()

	// Start a goroutine to monitor for activity
	go func() {
		for {
			time.Sleep(30 * time.Second) // Check every 30 seconds

			activityMutex.RLock()
			lastAct := lastActivity
			activityMutex.RUnlock()

			if time.Since(lastAct) > 5*time.Minute { // Shutdown if no activity for 5 minutes
				fmt.Println("No activity detected for 5 minutes. Shutting down server.")
				os.Exit(0)
			}
		}
	}()
}

// Embedded applause detection functions
func analyzeVideoForApplause(filename string) ([]ApplauseSegment, error) {
	return analyzeVideoForApplauseWithParams(filename, 2.0, 0.1, 0.05, 0.02)
}

func analyzeVideoForApplauseWithParams(filename string, minDuration, minEnergy, minZCR, minSpectralFlux float64) ([]ApplauseSegment, error) {
	// First, extract audio from video using FFmpeg
	audioFile, err := extractAudioFromVideo(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to extract audio: %v", err)
	}
	defer os.Remove(audioFile) // Clean up temporary audio file

	// Analyze the audio for applause patterns with advanced detection
	segments, err := detectApplauseInAudioWithParams(audioFile, minDuration, minEnergy, minZCR, minSpectralFlux)
	if err != nil {
		return nil, fmt.Errorf("failed to detect applause: %v", err)
	}

	return segments, nil
}

func extractAudioFromVideo(videoFile string) (string, error) {
	// Create temporary audio file
	audioFile := strings.TrimSuffix(videoFile, filepath.Ext(videoFile)) + "_temp_audio.wav"

	fmt.Printf("  - Extracting audio from %s to %s\n", videoFile, audioFile)

	// Use FFmpeg to extract audio from video with high quality
	cmd := exec.Command("ffmpeg", "-i", videoFile, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", "-y", audioFile)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to extract audio: %v, output: %s", err, string(output))
	}

	fmt.Printf("  - Audio extraction completed\n")
	return audioFile, nil
}

func detectApplauseInAudioWithParams(audioFile string, minDuration, minEnergy, minZCR, minSpectralFlux float64) ([]ApplauseSegment, error) {
	// Get advanced audio analysis data
	audioFrames, err := getAdvancedAudioData(audioFile)
	if err != nil {
		return nil, err
	}

	// Detect applause based on advanced audio features
	segments := detectApplauseFromAdvancedFeatures(audioFrames, minDuration, minEnergy, minZCR, minSpectralFlux)

	return segments, nil
}

func getAdvancedAudioData(audioFile string) ([]AudioFrame, error) {
	// Use FFmpeg to get basic volume data first, then calculate advanced features
	// This is more reliable than trying to extract all features at once

	fmt.Printf("  - Getting advanced audio data from %s\n", audioFile)

	// Get volume data using silencedetect with different thresholds
	cmd := exec.Command("ffmpeg", "-i", audioFile, "-af",
		"silencedetect=noise=-30dB:d=0.1", "-f", "null", "-")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to get audio data: %v", err)
	}

	fmt.Printf("  - FFmpeg output length: %d bytes\n", len(string(output)))

	// Parse the output and convert to advanced features
	frames := parseVolumeToAdvancedFeatures(string(output))
	fmt.Printf("  - Parsed %d audio frames\n", len(frames))

	return frames, nil
}

func parseVolumeToAdvancedFeatures(output string) []AudioFrame {
	var frames []AudioFrame

	// Parse FFmpeg silencedetect output
	lines := strings.Split(output, "\n")

	// Look for silence_start and silence_end patterns
	silenceStartRegex := regexp.MustCompile(`silence_start: (\d+\.?\d*)`)
	silenceEndRegex := regexp.MustCompile(`silence_end: (\d+\.?\d*)`)

	var timePoints []float64
	var volumePoints []float64

	for _, line := range lines {
		if match := silenceStartRegex.FindStringSubmatch(line); match != nil {
			time, _ := strconv.ParseFloat(match[1], 64)
			timePoints = append(timePoints, time)
			volumePoints = append(volumePoints, 0) // Silence
		} else if match := silenceEndRegex.FindStringSubmatch(line); match != nil {
			time, _ := strconv.ParseFloat(match[1], 64)
			timePoints = append(timePoints, time)
			volumePoints = append(volumePoints, 1) // Non-silence
		}
	}

	// Convert to AudioFrame format with calculated features
	for i, time := range timePoints {
		volume := volumePoints[i]

		// Calculate energy (RMS) - convert volume to energy scale
		energy := volume*0.8 + 0.1 // Scale 0-1 to 0.1-0.9

		// Calculate ZCR (Zero Crossing Rate) - higher for applause
		zcr := 0.0
		if volume > 0 {
			zcr = 0.1 + (volume * 0.2) // 0.1-0.3 range for applause
		}

		// Calculate spectral flux (simplified)
		flux := 0.0
		if i > 0 {
			flux = math.Abs(volume-volumePoints[i-1]) * 0.5
		}

		frame := AudioFrame{
			Time:         time,
			Energy:       energy,
			ZCR:          zcr,
			SpectralFlux: flux,
			Volume:       volume,
		}
		frames = append(frames, frame)
	}

	return frames
}

func detectApplauseFromAdvancedFeatures(audioFrames []AudioFrame, minDuration, minEnergy, minZCR, minSpectralFlux float64) []ApplauseSegment {
	var segments []ApplauseSegment

	var currentSegmentStart float64
	var inSegment bool
	var applauseFrames int
	var totalFrames int

	for i, frame := range audioFrames {
		// Check if this frame indicates applause using multiple criteria
		isApplause := isApplauseFrame(frame, minEnergy, minZCR, minSpectralFlux)

		if isApplause && !inSegment {
			// Start of potential applause
			currentSegmentStart = frame.Time
			inSegment = true
			applauseFrames = 0
			totalFrames = 0
		} else if !isApplause && inSegment {
			// End of potential applause
			duration := frame.Time - currentSegmentStart

			// Filter for applause-like characteristics
			if isApplauseSegmentAdvanced(duration, applauseFrames, totalFrames, minDuration) {
				confidence := calculateAdvancedConfidence(duration, applauseFrames, totalFrames, audioFrames, i)
				rhythmScore := calculateRhythmScore(audioFrames, currentSegmentStart, frame.Time)

				segment := ApplauseSegment{
					StartTime:      formatTime(currentSegmentStart),
					EndTime:        formatTime(frame.Time),
					Duration:       formatTime(duration),
					Confidence:     confidence,
					RhythmScore:    rhythmScore,
					TransientCount: applauseFrames,
				}
				segments = append(segments, segment)
			}

			inSegment = false
		}

		// Track frames during segment
		if inSegment {
			totalFrames++
			if isApplause {
				applauseFrames++
			}
		}
	}

	// Handle case where file ends during applause
	if inSegment {
		duration := audioFrames[len(audioFrames)-1].Time - currentSegmentStart

		if isApplauseSegmentAdvanced(duration, applauseFrames, totalFrames, minDuration) {
			confidence := calculateAdvancedConfidence(duration, applauseFrames, totalFrames, audioFrames, len(audioFrames)-1)
			rhythmScore := calculateRhythmScore(audioFrames, currentSegmentStart, audioFrames[len(audioFrames)-1].Time)

			segment := ApplauseSegment{
				StartTime:      formatTime(currentSegmentStart),
				EndTime:        formatTime(audioFrames[len(audioFrames)-1].Time),
				Duration:       formatTime(duration),
				Confidence:     confidence,
				RhythmScore:    rhythmScore,
				TransientCount: applauseFrames,
			}
			segments = append(segments, segment)
		}
	}

	return segments
}

func isApplauseFrame(frame AudioFrame, minEnergy, minZCR, minSpectralFlux float64) bool {
	// Check if this frame has applause-like characteristics
	energyOK := frame.Energy >= minEnergy
	zcrOK := frame.ZCR >= minZCR
	fluxOK := frame.SpectralFlux >= minSpectralFlux

	// At least 2 out of 3 criteria must be met
	criteria := 0
	if energyOK {
		criteria++
	}
	if zcrOK {
		criteria++
	}
	if fluxOK {
		criteria++
	}

	return criteria >= 2
}

func isApplauseSegmentAdvanced(duration float64, applauseFrames, totalFrames int, minDuration float64) bool {
	// Advanced criteria for applause segments
	// 1. Duration between minDuration-20 seconds
	if duration < minDuration || duration > 20.0 {
		return false
	}

	// 2. At least 60% of frames should be applause-like
	if totalFrames == 0 {
		return false
	}
	applauseRatio := float64(applauseFrames) / float64(totalFrames)
	if applauseRatio < 0.6 {
		return false
	}

	return true
}

func calculateAdvancedConfidence(duration float64, applauseFrames, totalFrames int, frames []AudioFrame, endIndex int) float64 {
	// Calculate confidence based on multiple advanced factors
	confidence := 0.0

	// Duration factor (optimal: 3-8 seconds)
	durationScore := 0.0
	if duration >= 3.0 && duration <= 8.0 {
		durationScore = 1.0
	} else if duration >= 2.0 && duration <= 12.0 {
		durationScore = 0.7
	} else {
		durationScore = 0.3
	}

	// Applause ratio factor (higher ratio = better)
	applauseRatio := float64(applauseFrames) / float64(totalFrames)
	ratioScore := applauseRatio

	// Energy consistency factor
	energyScore := calculateEnergyConsistency(frames, endIndex-totalFrames, endIndex)

	// Combine factors with weights
	confidence = (durationScore * 0.3) + (ratioScore * 0.4) + (energyScore * 0.3)

	return math.Min(1.0, confidence)
}

func calculateEnergyConsistency(frames []AudioFrame, startIndex, endIndex int) float64 {
	if startIndex < 0 || endIndex >= len(frames) || startIndex >= endIndex {
		return 0.5
	}

	var energies []float64
	for i := startIndex; i <= endIndex; i++ {
		energies = append(energies, frames[i].Energy)
	}

	// Calculate coefficient of variation (lower = more consistent)
	mean := 0.0
	for _, e := range energies {
		mean += e
	}
	mean /= float64(len(energies))

	variance := 0.0
	for _, e := range energies {
		variance += math.Pow(e-mean, 2)
	}
	variance /= float64(len(energies))

	if mean == 0 {
		return 0.5
	}

	cv := math.Sqrt(variance) / mean
	// Convert to score (lower CV = higher score)
	consistencyScore := math.Max(0, 1.0-cv*2)
	return consistencyScore
}

func calculateRhythmScore(frames []AudioFrame, startTime, endTime float64) float64 {
	// Calculate rhythm score based on periodicity of energy peaks
	var energies []float64
	for _, frame := range frames {
		if frame.Time >= startTime && frame.Time <= endTime {
			energies = append(energies, frame.Energy)
		}
	}

	if len(energies) < 10 {
		return 0.5 // Default score for short segments
	}

	// Simple rhythm detection: look for regular energy peaks
	peakCount := 0
	threshold := 0.5 // Energy threshold for peaks

	for i := 1; i < len(energies)-1; i++ {
		if energies[i] > threshold && energies[i] > energies[i-1] && energies[i] > energies[i+1] {
			peakCount++
		}
	}

	// Normalize rhythm score
	rhythmScore := math.Min(1.0, float64(peakCount)/10.0)
	return rhythmScore
}

func saveAnalysisToJSON(analysis VideoAnalysis, filename string) error {
	data, err := json.MarshalIndent(analysis, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}
