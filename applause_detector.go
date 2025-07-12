package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

type ApplauseSegment struct {
	StartTime  string  `json:"start_time"`
	EndTime    string  `json:"end_time"`
	Duration   string  `json:"duration"`
	Confidence float64 `json:"confidence"`
	Selected   bool    `json:"selected"`
}

type VideoAnalysis struct {
	Filename string            `json:"filename"`
	Segments []ApplauseSegment `json:"applause_segments"`
}

type VolumePoint struct {
	Time   float64
	Volume float64
}

func main() {
	// Find all MOV files in the current directory
	movFiles, err := findMOVFiles(".")
	if err != nil {
		log.Fatalf("Error finding MOV files: %v", err)
	}

	if len(movFiles) == 0 {
		log.Println("No MOV files found in current directory")
		return
	}

	fmt.Printf("Found %d MOV files to analyze:\n", len(movFiles))
	for _, file := range movFiles {
		fmt.Printf("  - %s\n", file)
	}
	fmt.Println()

	// Process files concurrently with limited concurrency
	semaphore := make(chan struct{}, 2) // Limit to 2 concurrent processes
	var wg sync.WaitGroup

	for _, filename := range movFiles {
		wg.Add(1)
		go func(fname string) {
			defer wg.Done()
			semaphore <- struct{}{}        // Acquire semaphore
			defer func() { <-semaphore }() // Release semaphore

			fmt.Printf("Analyzing %s...\n", fname)

			segments, err := analyzeVideoForApplause(fname)
			if err != nil {
				log.Printf("Error analyzing %s: %v", fname, err)
				return
			}

			// Create analysis result
			analysis := VideoAnalysis{
				Filename: fname,
				Segments: segments,
			}

			// Output results
			fmt.Printf("\nResults for %s:\n", fname)
			if len(segments) == 0 {
				fmt.Println("  No applause segments detected")
			} else {
				fmt.Printf("  Found %d applause segments:\n", len(segments))
				for i, segment := range segments {
					fmt.Printf("    %d. %s - %s (duration: %s, confidence: %.2f)\n",
						i+1, segment.StartTime, segment.EndTime, segment.Duration, segment.Confidence)
				}

				// Suggest split points
				fmt.Printf("\n  Suggested split points:\n")
				for i, segment := range segments {
					fmt.Printf("    Split %d: %s (after applause ends)\n", i+1, segment.EndTime)
				}
			}

			// Save detailed results to JSON file
			outputFilename := strings.TrimSuffix(fname, filepath.Ext(fname)) + "_applause_analysis.json"
			if err := saveAnalysisToJSON(analysis, outputFilename); err != nil {
				log.Printf("Error saving analysis for %s: %v", fname, err)
			} else {
				fmt.Printf("  Detailed results saved to: %s\n", outputFilename)
			}
			fmt.Println()
		}(filename)
	}

	wg.Wait()
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
	// First, extract audio from video using FFmpeg
	audioFile, err := extractAudioFromVideo(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to extract audio: %v", err)
	}
	defer os.Remove(audioFile) // Clean up temporary audio file

	// Analyze the audio for applause patterns
	segments, err := detectApplauseInAudio(audioFile)
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
	// Get volume data at regular intervals
	volumeData, err := getAudioVolumeData(audioFile)
	if err != nil {
		return nil, err
	}

	// Detect applause based on volume patterns
	segments := detectApplauseFromVolume(volumeData)

	return segments, nil
}

func getAudioVolumeData(audioFile string) ([]VolumePoint, error) {
	// Use FFmpeg to analyze audio and get volume data at regular intervals
	// We'll use the silencedetect filter to find periods of high activity
	cmd := exec.Command("ffmpeg", "-i", audioFile, "-af",
		"silencedetect=noise=-30dB:d=0.1", "-f", "null", "-")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to get volume data: %v", err)
	}

	// Parse the output to extract silence/non-silence periods
	return parseSilenceOutput(string(output)), nil
}

func parseSilenceOutput(output string) []VolumePoint {
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
	var segments []ApplauseSegment

	// Look for patterns that indicate applause:
	// 1. Sudden increase in volume (silence_end)
	// 2. Sustained high volume for a reasonable duration
	// 3. Followed by return to silence (silence_start)

	// For applause detection, we're looking for:
	// - Non-silence periods that are between 2-20 seconds long
	// - These represent potential applause segments

	var currentSegmentStart float64
	var inSegment bool

	for _, point := range volumeData {
		if point.Volume > 0 && !inSegment {
			// Start of potential applause
			currentSegmentStart = point.Time
			inSegment = true
		} else if point.Volume == 0 && inSegment {
			// End of potential applause
			duration := point.Time - currentSegmentStart

			// Filter for applause-like characteristics
			if duration >= 2.0 && duration <= 20.0 {
				// Calculate confidence based on duration (longer = more likely to be applause)
				confidence := calculateConfidence(duration)

				segment := ApplauseSegment{
					StartTime:  formatTime(currentSegmentStart),
					EndTime:    formatTime(point.Time),
					Duration:   formatTime(duration),
					Confidence: confidence,
				}
				segments = append(segments, segment)
			}

			inSegment = false
		}
	}

	// Handle case where file ends during applause
	if inSegment {
		duration := volumeData[len(volumeData)-1].Time - currentSegmentStart
		if duration >= 2.0 && duration <= 20.0 {
			confidence := calculateConfidence(duration)

			segment := ApplauseSegment{
				StartTime:  formatTime(currentSegmentStart),
				EndTime:    formatTime(volumeData[len(volumeData)-1].Time),
				Duration:   formatTime(duration),
				Confidence: confidence,
			}
			segments = append(segments, segment)
		}
	}

	return segments
}

func calculateConfidence(duration float64) float64 {
	// Higher confidence for durations in the middle range (4-12 seconds)
	// Lower confidence for very short or very long durations
	if duration >= 4.0 && duration <= 12.0 {
		return 0.9
	} else if duration >= 3.0 && duration <= 15.0 {
		return 0.7
	} else {
		return 0.5
	}
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
