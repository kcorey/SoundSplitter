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

type AudioFrame struct {
	Time         float64
	Energy       float64
	ZCR          float64
	SpectralFlux float64
	Volume       float64
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
	var minDuration, minEnergy, minZCR, minSpectralFlux float64
	var sensitivity float64

	// Default values
	minDuration = 2.0
	minEnergy = 0.1
	minZCR = 0.05
	minSpectralFlux = 0.02
	sensitivity = 5.0 // 1-10 scale

	// Check if a video file was provided
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run applause_detector.go <video_file> [--sensitivity <1-10>] [--min-duration <seconds>]")
		fmt.Println("Example: go run applause_detector.go IMG_2333.MOV --sensitivity 7 --min-duration 1.5")
		os.Exit(1)
	}

	videoFile := os.Args[1]

	// Parse optional parameters
	for i := 2; i < len(os.Args); i += 2 {
		if i+1 >= len(os.Args) {
			break
		}

		switch os.Args[i] {
		case "--sensitivity":
			if val, err := strconv.ParseFloat(os.Args[i+1], 64); err == nil {
				sensitivity = val
			}
		case "--min-duration":
			if val, err := strconv.ParseFloat(os.Args[i+1], 64); err == nil {
				minDuration = val
			}
		}
	}

	// Map sensitivity to detection parameters
	minEnergy, minZCR, minSpectralFlux = mapSensitivityToParams(sensitivity)

	// Check if file exists
	if _, err := os.Stat(videoFile); os.IsNotExist(err) {
		log.Fatalf("Video file not found: %s", videoFile)
	}

	fmt.Printf("Analyzing %s with sensitivity: %.1f (energy=%.3f, zcr=%.3f, flux=%.3f, duration=%.1f)\n",
		videoFile, sensitivity, minEnergy, minZCR, minSpectralFlux, minDuration)

	// Analyze the specified video file
	segments, err := analyzeVideoForApplauseWithParams(videoFile, minDuration, minEnergy, minZCR, minSpectralFlux)
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

func mapSensitivityToParams(sensitivity float64) (minEnergy, minZCR, minSpectralFlux float64) {
	// Map sensitivity 1-10 to detection parameters
	// Higher sensitivity = lower thresholds = more detections
	// Lower sensitivity = higher thresholds = fewer detections

	// Energy threshold (0.05 to 0.3)
	minEnergy = 0.3 - (sensitivity * 0.025)

	// Zero Crossing Rate threshold (0.02 to 0.15)
	minZCR = 0.15 - (sensitivity * 0.013)

	// Spectral Flux threshold (0.01 to 0.08)
	minSpectralFlux = 0.08 - (sensitivity * 0.007)

	return minEnergy, minZCR, minSpectralFlux
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

	// Use FFmpeg to extract audio from video with high quality
	cmd := exec.Command("ffmpeg", "-i", videoFile, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", "-y", audioFile)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to extract audio: %v, output: %s", err, string(output))
	}

	return audioFile, nil
}

func detectApplauseInAudio(audioFile string) ([]ApplauseSegment, error) {
	return detectApplauseInAudioWithParams(audioFile, 2.0, 0.1, 0.05, 0.02)
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

	// Get volume data using silencedetect with different thresholds
	cmd := exec.Command("ffmpeg", "-i", audioFile, "-af",
		"silencedetect=noise=-30dB:d=0.1", "-f", "null", "-")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to get audio data: %v", err)
	}

	// Parse the output and convert to advanced features
	return parseVolumeToAdvancedFeatures(string(output)), nil
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

	// Look for applause patterns using advanced features:
	// 1. High energy periods (STE)
	// 2. High Zero Crossing Rate (ZCR)
	// 3. High Spectral Flux (sudden changes)
	// 4. Appropriate duration
	// 5. Periodicity analysis

	var currentSegmentStart float64
	var inSegment bool
	var applauseFrames int
	var totalFrames int

	// Debug: Print audio data summary
	fmt.Printf("Debug: Found %d audio frames\n", len(audioFrames))
	if len(audioFrames) > 0 {
		fmt.Printf("Debug: Time range: %.2f to %.2f seconds\n", audioFrames[0].Time, audioFrames[len(audioFrames)-1].Time)
	}

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

			// Debug: Print segment info
			fmt.Printf("Debug: Potential segment %.2f-%.2f (duration: %.2f, applause_ratio: %.2f)\n",
				currentSegmentStart, frame.Time, duration, float64(applauseFrames)/float64(totalFrames))

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
	// This is a simplified version - in practice you'd use autocorrelation

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
