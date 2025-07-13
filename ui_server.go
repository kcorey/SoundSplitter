package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/unidoc/unipdf/v3/extractor"
	"github.com/unidoc/unipdf/v3/model"
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
	// Serve static files
	http.HandleFunc("/", handleStatic)

	// API endpoints
	http.HandleFunc("/api/analyzed-files", handleAnalyzedFiles)
	http.HandleFunc("/api/split-video", handleSplitVideo)
	http.HandleFunc("/api/presenters", handlePresenters)
	http.HandleFunc("/api/toastmaster", handleToastmaster)
	http.HandleFunc("/api/run-detection", handleRunDetection)
	http.HandleFunc("/api/save-bash-script", handleSaveBashScript)
	http.HandleFunc("/videos/", handleVideoFiles)

	port := ":8080"
	fmt.Printf("Starting SoundSplitter server on http://localhost%s\n", port)
	fmt.Println("Open your browser and navigate to the URL above")

	log.Fatal(http.ListenAndServe(port, nil))
}

func handleStatic(w http.ResponseWriter, r *http.Request) {
	// Handle root path
	if r.URL.Path == "/" {
		http.ServeFile(w, r, "index.html")
		return
	}

	// Serve static files from current directory
	filePath := r.URL.Path[1:] // Remove leading slash

	// Security: prevent directory traversal
	if strings.Contains(filePath, "..") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Check if file exists before serving
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, filePath)
}

func handleAnalyzedFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Find all JSON analysis files
	files, err := findAnalysisFiles(".")
	if err != nil {
		http.Error(w, fmt.Sprintf("Error finding analysis files: %v", err), http.StatusInternalServerError)
		return
	}

	// Load and parse each analysis file
	var analyses []VideoAnalysis
	for _, file := range files {
		analysis, err := loadAnalysisFile(file)
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

	// Try to load presenters from the JSON file first
	jsonFile := "extracted_presenters.json"
	if _, err := os.Stat(jsonFile); err == nil {
		// JSON file exists, load from it
		data, err := os.ReadFile(jsonFile)
		if err != nil {
			log.Printf("Error reading JSON file: %v", err)
		} else {
			var presenters []Presenter
			if err := json.Unmarshal(data, &presenters); err != nil {
				log.Printf("Error parsing JSON: %v", err)
			} else {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(presenters)
				return
			}
		}
	}

	// Fallback: Find PDF files and try to parse them
	pdfFiles, err := findPDFFiles(".")
	if err != nil {
		http.Error(w, fmt.Sprintf("Error finding PDF files: %v", err), http.StatusInternalServerError)
		return
	}

	var allPresenters []Presenter
	for _, pdfFile := range pdfFiles {
		presenters, err := parsePDFPresenters(pdfFile)
		if err != nil {
			log.Printf("Error parsing PDF %s: %v", pdfFile, err)
			continue
		}
		allPresenters = append(allPresenters, presenters...)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(allPresenters)
}

func handleToastmaster(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Try to load detected toastmaster from file
	toastmasterFile := "detected_toastmaster.json"
	if _, err := os.Stat(toastmasterFile); err == nil {
		data, err := os.ReadFile(toastmasterFile)
		if err == nil {
			var toastmasterData map[string]string
			if err := json.Unmarshal(data, &toastmasterData); err == nil {
				if toastmaster, exists := toastmasterData["toastmaster"]; exists {
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(map[string]string{"toastmaster": toastmaster})
					return
				}
			}
		}
	}

	// Return empty response if no toastmaster detected
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

	// Check if file exists
	if _, err := os.Stat(filename); os.IsNotExist(err) {
		http.Error(w, "Video file not found", http.StatusNotFound)
		return
	}

	// Serve the video file
	http.ServeFile(w, r, filename)
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

func findPDFFiles(dir string) ([]string, error) {
	var files []string

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			filename := entry.Name()
			if strings.ToUpper(filepath.Ext(filename)) == ".PDF" {
				files = append(files, filename)
			}
		}
	}

	return files, nil
}

func parsePDFPresenters(pdfFile string) ([]Presenter, error) {
	// Open the PDF file
	file, err := os.Open(pdfFile)
	if err != nil {
		return nil, fmt.Errorf("failed to open PDF file: %v", err)
	}
	defer file.Close()

	reader, err := model.NewPdfReader(file)
	if err != nil {
		return nil, fmt.Errorf("failed to create PDF reader: %v", err)
	}

	// Get the number of pages
	numPages, err := reader.GetNumPages()
	if err != nil {
		return nil, fmt.Errorf("failed to get page count: %v", err)
	}

	var allText string
	// Extract text from all pages
	for i := 1; i <= numPages; i++ {
		page, err := reader.GetPage(i)
		if err != nil {
			log.Printf("Error getting page %d: %v", i, err)
			continue
		}

		ex, err := extractor.New(page)
		if err != nil {
			log.Printf("Error creating extractor for page %d: %v", i, err)
			continue
		}

		text, err := ex.ExtractText()
		if err != nil {
			log.Printf("Error extracting text from page %d: %v", i, err)
			continue
		}

		allText += text + "\n"
	}

	return extractPresentersFromText(allText)
}

func extractPresentersFromText(text string) ([]Presenter, error) {
	var presenters []Presenter
	presenterSet := make(map[string]bool)
	var toastmaster string

	lines := strings.Split(text, "\n")

	timePattern := regexp.MustCompile(`^\d{1,2}:\d{2}$`)
	durationPattern := regexp.MustCompile(`^\d{1,2}:[0-5][0-9]$`)

	// Common words that start event descriptions
	eventStartWords := []string{
		"welcome", "open", "introduce", "explain", "describe", "report", "evaluate",
		"vote", "collect", "set", "table", "thought", "closing", "remarks",
		"speech", "evaluation", "minute", "request", "presidential", "handover",
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Skip header lines
		if strings.Contains(strings.ToLower(line), "time") ||
			strings.Contains(strings.ToLower(line), "role") ||
			strings.Contains(strings.ToLower(line), "presenter") ||
			strings.Contains(strings.ToLower(line), "event") ||
			strings.Contains(strings.ToLower(line), "theme") ||
			strings.Contains(strings.ToLower(line), "meeting") ||
			strings.Contains(strings.ToLower(line), "date") {
			continue
		}
		// Split on two or more spaces
		fields := regexp.MustCompile(`\s{2,}`).Split(line, -1)
		if len(fields) < 2 {
			continue
		}

		// Check for Toastmaster role
		roleField := ""
		presenterField := ""

		if timePattern.MatchString(strings.TrimSpace(fields[0])) {
			if len(fields) >= 2 {
				roleField = strings.TrimSpace(fields[1])
			}
			if len(fields) >= 3 {
				presenterField = strings.TrimSpace(fields[2])
			}
		} else {
			roleField = strings.TrimSpace(fields[0])
			presenterField = strings.TrimSpace(fields[1])
		}

		// Detect Toastmaster
		if strings.Contains(strings.ToLower(roleField), "toastmaster") && presenterField != "" {
			toastmaster = presenterField
			fmt.Printf("Detected Toastmaster: %s\n", toastmaster)
		}

		if presenterField == "" {
			continue
		}
		// Filter out durations and non-names
		if durationPattern.MatchString(presenterField) ||
			strings.Contains(strings.ToLower(presenterField), "break") ||
			strings.Contains(strings.ToLower(presenterField), "duration") ||
			strings.Contains(strings.ToLower(presenterField), "meet") ||
			strings.Contains(strings.ToLower(presenterField), "greet") ||
			strings.Contains(strings.ToLower(presenterField), "amber") ||
			strings.Contains(strings.ToLower(presenterField), "green") ||
			strings.Contains(strings.ToLower(presenterField), "red") {
			continue
		}
		// Extract just the presenter name (before event text)
		presenter := extractPresenterName(presenterField, eventStartWords)
		if presenter == "" {
			continue
		}
		if !presenterSet[presenter] {
			presenterSet[presenter] = true
			presenters = append(presenters, Presenter{
				Presenter: presenter,
			})
		}
	}

	// Save detected toastmaster to a file for the frontend to use
	if toastmaster != "" {
		toastmasterData := map[string]string{"toastmaster": toastmaster}
		if data, err := json.Marshal(toastmasterData); err == nil {
			os.WriteFile("detected_toastmaster.json", data, 0644)
		}
	}

	return presenters, nil
}

func extractPresenterName(field string, eventStartWords []string) string {
	words := strings.Fields(field)
	if len(words) == 0 {
		return ""
	}

	// Look for the first word that starts an event description
	for i, word := range words {
		wordLower := strings.ToLower(word)
		for _, eventWord := range eventStartWords {
			if strings.HasPrefix(wordLower, eventWord) {
				// Found event text, return everything before it
				if i > 0 {
					return strings.Join(words[:i], " ")
				}
				return ""
			}
		}
	}

	// If no event text found, return the whole field
	return field
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
