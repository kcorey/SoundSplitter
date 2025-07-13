package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type VolumePoint struct {
	Time   float64
	Volume float64
}

type ApplauseSegment struct {
	StartTime      string  `json:"start_time"`
	EndTime        string  `json:"end_time"`
	Duration       string  `json:"duration"`
	Confidence     float64 `json:"confidence"`
	RhythmScore    float64 `json:"rhythm_score"`
	TransientCount int     `json:"transient_count"`
}

type VideoAnalysis struct {
	Filename string            `json:"filename"`
	Segments []ApplauseSegment `json:"applause_segments"`
}

func main() {
	// Parse command line arguments
	var minDuration, minVolumeChanges float64
	var minChangeDensity float64

	// Default values
	minDuration = 2.0
	minVolumeChanges = 1.0
	minChangeDensity = 0.1

	// Check if a video file was provided
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run applause_detector.go <video_file> [--min-duration <seconds>] [--min-volume-changes <count>] [--min-change-density <density>]")
		fmt.Println("Example: go run applause_detector.go IMG_2333.MOV --min-duration 1.5 --min-volume-changes 2 --min-change-density 0.05")
		os.Exit(1)
	}

	videoFile := os.Args[1]

	// Parse optional parameters
	for i := 2; i < len(os.Args); i += 2 {
		if i+1 >= len(os.Args) {
			break
		}

		switch os.Args[i] {
		case "--min-duration":
			if val, err := strconv.ParseFloat(os.Args[i+1], 64); err == nil {
				minDuration = val
			}
		case "--min-volume-changes":
			if val, err := strconv.ParseFloat(os.Args[i+1], 64); err == nil {
				minVolumeChanges = val
			}
		case "--min-change-density":
			if val, err := strconv.ParseFloat(os.Args[i+1], 64); err == nil {
				minChangeDensity = val
			}
		}
	}

	// Check if file exists
	if _, err := os.Stat(videoFile); os.IsNotExist(err) {
		log.Fatalf("Video file not found: %s", videoFile)
	}

	fmt.Printf("Analyzing %s with sensitivity: min-duration=%.1f, min-volume-changes=%.1f, min-change-density=%.3f\n",
		videoFile, minDuration, minVolumeChanges, minChangeDensity)

	// Analyze the specified video file
	segments, err := analyzeVideoForApplauseWithParams(videoFile, minDuration, minVolumeChanges, minChangeDensity)
	if err != nil {
		log.Fatalf("Error analyzing %s: %v", videoFile, err)
	}

	// Create analysis result
	analysis := VideoAnalysis{
		Filename: videoFile,
		Segments: segments,
	}

	// Output results
	fmt.Printf("\nResults for %s:\n", videoFile)
	if len(segments) == 0 {
		fmt.Println("  No applause segments detected")
	} else {
		fmt.Printf("  Found %d applause segments:\n", len(segments))
		for i, segment := range segments {
			fmt.Printf("    %d. %s - %s (duration: %s, confidence: %.2f, rhythm: %.2f, transients: %d)\n",
				i+1, segment.StartTime, segment.EndTime, segment.Duration, segment.Confidence, segment.RhythmScore, segment.TransientCount)
		}

		// Suggest split points
		fmt.Printf("\n  Suggested split points:\n")
		for i, segment := range segments {
			fmt.Printf("    Split %d: %s (after applause ends)\n", i+1, segment.EndTime)
		}
	}

	// Save detailed results to JSON file
	outputFilename := strings.TrimSuffix(videoFile, filepath.Ext(videoFile)) + "_applause_analysis.json"
	if err := saveAnalysisToJSON(analysis, outputFilename); err != nil {
		log.Printf("Error saving analysis for %s: %v", videoFile, err)
	} else {
		fmt.Printf("  Detailed results saved to: %s\n", outputFilename)
	}
}

func findMOVFiles(dir string) ([]string, error) {
	var files []string

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			filename := entry.Name()
			if strings.ToUpper(filepath.Ext(filename)) == ".MOV" {
				files = append(files, filename)
			}
		}
	}

	return files, nil
}

func analyzeVideoForApplause(filename string) ([]ApplauseSegment, error) {
	return analyzeVideoForApplauseWithParams(filename, 2.0, 1.0, 0.1)
}

func analyzeVideoForApplauseWithParams(filename string, minDuration, minVolumeChanges, minChangeDensity float64) ([]ApplauseSegment, error) {
	// First, extract audio from video using FFmpeg
	audioFile, err := extractAudioFromVideo(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to extract audio: %v", err)
	}
	defer os.Remove(audioFile) // Clean up temporary audio file

	// Analyze the audio for applause patterns with improved detection
	segments, err := detectApplauseInAudioWithParams(audioFile, minDuration, minVolumeChanges, minChangeDensity)
	if err != nil {
		return nil, fmt.Errorf("failed to detect applause: %v", err)
	}

	return segments, nil
}

func extractAudioFromVideo(videoFile string) (string, error) {
	// Create temporary audio file
	audioFile := strings.TrimSuffix(videoFile, filepath.Ext(videoFile)) + "_temp_audio.wav"

	// Use FFmpeg to extract audio from video
	cmd := exec.Command("ffmpeg", "-i", videoFile, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", "-y", audioFile)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to extract audio: %v, output: %s", err, string(output))
	}

	return audioFile, nil
}

func detectApplauseInAudio(audioFile string) ([]ApplauseSegment, error) {
	return detectApplauseInAudioWithParams(audioFile, 2.0, 1.0, 0.1)
}

func detectApplauseInAudioWithParams(audioFile string, minDuration, minVolumeChanges, minChangeDensity float64) ([]ApplauseSegment, error) {
	// Get volume data at regular intervals
	volumeData, err := getHighResolutionVolumeData(audioFile)
	if err != nil {
		return nil, err
	}

	// Detect applause based on improved volume patterns
	segments := detectApplauseFromVolumeWithParams(volumeData, minDuration, minVolumeChanges, minChangeDensity)

	return segments, nil
}

func getHighResolutionVolumeData(audioFile string) ([]VolumePoint, error) {
	// Use FFmpeg to get volume data at high resolution
	// We'll use the silencedetect filter but with different thresholds for better volume analysis
	cmd := exec.Command("ffmpeg", "-i", audioFile, "-af",
		"silencedetect=noise=-30dB:d=0.1", "-f", "null", "-")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to get volume data: %v", err)
	}

	// Parse the output to extract volume levels
	return parseVolumeOutput(string(output)), nil
}

func parseVolumeOutput(output string) []VolumePoint {
	var points []VolumePoint

	// Parse FFmpeg silencedetect output
	lines := strings.Split(output, "\n")

	// Look for silence_start and silence_end patterns
	silenceStartRegex := regexp.MustCompile(`silence_start: (\d+\.?\d*)`)
	silenceEndRegex := regexp.MustCompile(`silence_end: (\d+\.?\d*)`)

	for _, line := range lines {
		if match := silenceStartRegex.FindStringSubmatch(line); match != nil {
			time, _ := strconv.ParseFloat(match[1], 64)
			points = append(points, VolumePoint{Time: time, Volume: 0})
		} else if match := silenceEndRegex.FindStringSubmatch(line); match != nil {
			time, _ := strconv.ParseFloat(match[1], 64)
			points = append(points, VolumePoint{Time: time, Volume: 1})
		}
	}

	return points
}

func detectApplauseFromVolume(volumeData []VolumePoint) []ApplauseSegment {
	return detectApplauseFromVolumeWithParams(volumeData, 2.0, 1.0, 0.1)
}

func detectApplauseFromVolumeWithParams(volumeData []VolumePoint, minDuration, minVolumeChanges, minChangeDensity float64) []ApplauseSegment {
	var segments []ApplauseSegment

	// Look for applause patterns with improved criteria:
	// 1. High volume periods (non-silence)
	// 2. Appropriate duration
	// 3. Pattern analysis

	var currentSegmentStart float64
	var inSegment bool
	var volumeChanges int

	// Debug: Print volume data summary
	fmt.Printf("Debug: Found %d volume points\n", len(volumeData))
	if len(volumeData) > 0 {
		fmt.Printf("Debug: Time range: %.2f to %.2f seconds\n", volumeData[0].Time, volumeData[len(volumeData)-1].Time)
	}

	for i, point := range volumeData {
		// Check if this point indicates applause
		isApplause := point.Volume > 0 // Non-silence indicates potential applause

		if isApplause && !inSegment {
			// Start of potential applause
			currentSegmentStart = point.Time
			inSegment = true
			volumeChanges = 0
		} else if !isApplause && inSegment {
			// End of potential applause
			duration := point.Time - currentSegmentStart

			// Debug: Print segment info
			fmt.Printf("Debug: Potential segment %.2f-%.2f (duration: %.2f, changes: %d)\n",
				currentSegmentStart, point.Time, duration, volumeChanges)

			// Filter for applause-like characteristics
			if isApplauseSegmentWithParams(duration, volumeChanges, minDuration, minVolumeChanges, minChangeDensity) {
				confidence := calculateImprovedConfidence(duration, volumeChanges)

				segment := ApplauseSegment{
					StartTime:      formatTime(currentSegmentStart),
					EndTime:        formatTime(point.Time),
					Duration:       formatTime(duration),
					Confidence:     confidence,
					RhythmScore:    0.5, // Default rhythm score
					TransientCount: volumeChanges,
				}
				segments = append(segments, segment)
			}

			inSegment = false
		}

		// Track volume changes during segment
		if inSegment && i > 0 {
			if volumeData[i].Volume != volumeData[i-1].Volume {
				volumeChanges++
			}
		}
	}

	// Handle case where file ends during applause
	if inSegment {
		duration := volumeData[len(volumeData)-1].Time - currentSegmentStart

		if isApplauseSegmentWithParams(duration, volumeChanges, minDuration, minVolumeChanges, minChangeDensity) {
			confidence := calculateImprovedConfidence(duration, volumeChanges)

			segment := ApplauseSegment{
				StartTime:      formatTime(currentSegmentStart),
				EndTime:        formatTime(volumeData[len(volumeData)-1].Time),
				Duration:       formatTime(duration),
				Confidence:     confidence,
				RhythmScore:    0.5, // Default rhythm score
				TransientCount: volumeChanges,
			}
			segments = append(segments, segment)
		}
	}

	return segments
}

func isApplauseSegment(duration float64, volumeChanges int) bool {
	return isApplauseSegmentWithParams(duration, volumeChanges, 2.0, 1.0, 0.1)
}

func isApplauseSegmentWithParams(duration float64, volumeChanges int, minDuration, minVolumeChanges, minChangeDensity float64) bool {
	// Improved criteria for applause segments
	// 1. Duration between minDuration-20 seconds
	if duration < minDuration || duration > 20.0 {
		return false
	}

	// 2. Sufficient volume changes (indicates activity)
	if float64(volumeChanges) < minVolumeChanges {
		return false
	}

	// 3. Volume change density (changes per second)
	changeDensity := float64(volumeChanges) / duration
	if changeDensity < minChangeDensity {
		return false
	}

	return true
}

func calculateImprovedConfidence(duration float64, volumeChanges int) float64 {
	// Calculate confidence based on multiple factors
	confidence := 0.0

	// Duration factor (optimal: 4-8 seconds, minimum 2 seconds)
	durationScore := 0.0
	if duration >= 4.0 && duration <= 8.0 {
		durationScore = 1.0
	} else if duration >= 2.0 && duration <= 12.0 {
		durationScore = 0.7
	} else {
		durationScore = 0.3
	}

	// Volume change factor (more changes = better)
	changeScore := math.Min(1.0, float64(volumeChanges)/8.0)

	// Combine factors with weights
	confidence = (durationScore * 0.6) + (changeScore * 0.4)

	return math.Min(1.0, confidence)
}

func formatTime(seconds float64) string {
	minutes := int(seconds) / 60
	secs := int(seconds) % 60
	return fmt.Sprintf("%02d:%02d", minutes, secs)
}

func saveAnalysisToJSON(analysis VideoAnalysis, filename string) error {
	data, err := json.MarshalIndent(analysis, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}
