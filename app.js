class SoundSplitterUI {
    constructor() {
        this.analyzedFiles = [];
        this.currentVideo = null;
        this.playbackTimeout = null;
        this.videoPlayer = document.getElementById('videoPlayer');
        this.fileList = document.getElementById('fileList');
        this.splitButton = document.getElementById('splitButton');
        this.splitProgress = document.getElementById('splitProgress');
        this.splitProgressBar = document.getElementById('splitProgressBar');
        this.splitStatus = document.getElementById('splitStatus');
        this.currentSegment = document.getElementById('currentSegment');
        
        this.initializeEventListeners();
        this.loadAnalyzedFiles();
        this.loadPresenters();
    }

    initializeEventListeners() {
        this.splitButton.addEventListener('click', () => this.splitVideos());
        
        // Video player event listeners
        this.videoPlayer.addEventListener('ended', () => {
            this.currentSegment.textContent = 'Video playback ended';
        });
    }

    async loadAnalyzedFiles() {
        try {
            // Look for JSON analysis files
            const response = await fetch('/api/analyzed-files');
            if (!response.ok) {
                throw new Error('Failed to load analyzed files');
            }
            
            this.analyzedFiles = await response.json();
            this.renderFileList();
            this.updateSplitButton();
        } catch (error) {
            console.error('Error loading analyzed files:', error);
            this.fileList.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    No analyzed files found. Please run the applause detector first.
                </div>
            `;
        }
    }

    async loadPresenters() {
        try {
            const response = await fetch('/api/presenters');
            if (!response.ok) {
                throw new Error('Failed to load presenters');
            }
            
            this.presenters = await response.json();
            this.renderPresenterTags();
        } catch (error) {
            console.error('Error loading presenters:', error);
            document.getElementById('presenterTags').innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    No presenter data found. PDF files will be parsed if available.
                </div>
            `;
        }
    }

    renderPresenterTags() {
        if (!this.presenters || this.presenters.length === 0) {
            document.getElementById('presenterTags').innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    No presenters found in PDF files.
                </div>
            `;
            return;
        }

        const uniquePresenters = [...new Set(this.presenters.map(p => p.presenter))];
        
        document.getElementById('presenterTags').innerHTML = `
            <div class="presenter-tags">
                ${uniquePresenters.map(presenter => `
                    <span class="badge bg-info me-2 mb-2" draggable="true" data-presenter="${presenter}">
                        ${presenter}
                    </span>
                `).join('')}
            </div>
        `;

        this.initializeDragAndDrop();
    }

    initializeDragAndDrop() {
        // Make presenter tags draggable
        const presenterTags = document.querySelectorAll('.presenter-tags .badge');
        presenterTags.forEach(tag => {
            tag.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', tag.dataset.presenter);
            });
        });

        // Make segment containers droppable
        const segmentItems = document.querySelectorAll('.segment-item');
        segmentItems.forEach(item => {
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                item.style.backgroundColor = '#e3f2fd';
            });
            
            item.addEventListener('dragleave', (e) => {
                item.style.backgroundColor = '';
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.style.backgroundColor = '';
                const presenter = e.dataTransfer.getData('text/plain');
                const filename = item.dataset.filename;
                const index = parseInt(item.dataset.index);
                this.addTag(filename, index, presenter);
            });
        });
    }

    renderFileList() {
        if (this.analyzedFiles.length === 0) {
            this.fileList.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    No analyzed files found. Run the applause detector to analyze your videos.
                </div>
            `;
            return;
        }

        // Sort files alphanumerically
        const sortedFiles = [...this.analyzedFiles].sort((a, b) => a.filename.localeCompare(b.filename));

        this.fileList.innerHTML = `
            <div class="segment-list">
                ${sortedFiles.map(file => this.renderFileSection(file)).join('')}
            </div>
        `;
    }

    renderFileSection(file) {
        const segments = file.applause_segments || [];
        
        return `
            <div class="file-section mb-3">
                <div class="file-header p-3 bg-light border-bottom">
                    <h6 class="mb-0 text-muted">
                        <i class="fas fa-video me-2"></i>
                        ${file.filename}
                    </h6>
                </div>
                <div class="segments-container">
                    ${segments.map((segment, index) => this.renderSegmentItem(segment, file.filename, index)).join('')}
                </div>
            </div>
        `;
    }

    renderSegmentItem(segment, filename, index) {
        const confidenceClass = this.getConfidenceClass(segment.confidence);
        const isSelected = segment.selected !== false;
        
        return `
            <div class="segment-item p-3 border-bottom ${isSelected ? 'selected' : ''}" 
                 onclick="app.splitterUI.playSegment('${filename}', ${index})"
                 data-filename="${filename}" data-index="${index}">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center">
                            <input type="checkbox" class="form-check-input me-3" 
                                   ${isSelected ? 'checked' : ''}
                                   onclick="event.stopPropagation(); app.splitterUI.toggleSegment('${filename}', ${index}, this.checked)">
                            <div>
                                <div class="fw-bold">
                                    ${segment.start_time} - ${segment.end_time}
                                    <span class="badge bg-secondary ms-2">${segment.duration}</span>
                                </div>
                                <small class="text-muted">
                                    Confidence: <span class="${confidenceClass}">${(segment.confidence * 100).toFixed(0)}%</span>
                                </small>
                                <div class="tags-container mt-1" data-filename="${filename}" data-index="${index}">
                                    ${(segment.tags || []).map(tag => `
                                        <span class="badge bg-primary me-1" draggable="true" data-tag="${tag}">
                                            ${tag} <i class="fas fa-times ms-1" onclick="event.stopPropagation(); app.splitterUI.removeTag('${filename}', ${index}, '${tag}')"></i>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="text-end">
                        <small class="text-muted">Split: ${segment.end_time}</small>
                    </div>
                </div>
            </div>
        `;
    }



    getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'confidence-high';
        if (confidence >= 0.6) return 'confidence-medium';
        return 'confidence-low';
    }

    toggleSegment(filename, index, selected) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (file && file.applause_segments[index]) {
            file.applause_segments[index].selected = selected;
            this.updateSplitButton();
        }
    }

    toggleAllSegments(filename, selected) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (file) {
            file.applause_segments.forEach(segment => {
                segment.selected = selected;
            });
            this.renderFileList();
            this.updateSplitButton();
        }
    }

    addTag(filename, index, tag) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (file && file.applause_segments[index]) {
            if (!file.applause_segments[index].tags) {
                file.applause_segments[index].tags = [];
            }
            if (!file.applause_segments[index].tags.includes(tag)) {
                file.applause_segments[index].tags.push(tag);
                this.renderFileList();
                this.initializeDragAndDrop(); // Re-initialize drag and drop after re-rendering
            }
        }
    }

    removeTag(filename, index, tag) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (file && file.applause_segments[index]) {
            if (file.applause_segments[index].tags) {
                file.applause_segments[index].tags = file.applause_segments[index].tags.filter(t => t !== tag);
                this.renderFileList();
                this.initializeDragAndDrop(); // Re-initialize drag and drop after re-rendering
            }
        }
    }

    async playSegment(filename, index) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (!file || !file.applause_segments[index]) return;

        // Stop any current playback
        this.stopCurrentPlayback();

        const segment = file.applause_segments[index];
        const startTime = this.parseTime(segment.start_time);
        const endTime = this.parseTime(segment.end_time);
        const duration = endTime - startTime;

        // Calculate playback start time (2 seconds before segment start)
        const playbackStart = Math.max(0, startTime - 2);
        const playbackDuration = duration + 14; // segment duration + 14 seconds (4 + 10 extra)

        // Set video source
        this.videoPlayer.src = `/videos/${filename}`;
        this.currentVideo = filename;

        // Clear any existing timeouts
        if (this.playbackTimeout) {
            clearTimeout(this.playbackTimeout);
        }

        // Wait for video to load, then set time
        this.videoPlayer.addEventListener('loadedmetadata', () => {
            this.videoPlayer.currentTime = playbackStart;
            this.videoPlayer.play();
            
            // Set a timeout to stop playback after the calculated duration
            this.playbackTimeout = setTimeout(() => {
                if (this.videoPlayer.src.includes(filename)) {
                    this.videoPlayer.pause();
                }
            }, playbackDuration * 1000);
        }, { once: true });

        // Update current segment display
        this.currentSegment.innerHTML = `
            <strong>Playing:</strong> ${segment.start_time} - ${segment.end_time} 
            <small class="text-muted">(Duration: ${segment.duration}, Playback: ${playbackDuration.toFixed(1)}s)</small>
        `;

        // Update visual selection
        document.querySelectorAll('.segment-item').forEach(item => {
            item.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');
    }

    stopCurrentPlayback() {
        // Clear any existing timeout
        if (this.playbackTimeout) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        
        // Pause current video if playing
        if (this.videoPlayer && !this.videoPlayer.paused) {
            this.videoPlayer.pause();
        }
    }

    parseTime(timeStr) {
        const parts = timeStr.split(':').map(Number);
        return parts[0] * 60 + parts[1];
    }

    updateSplitButton() {
        const hasSelectedSegments = this.analyzedFiles.some(file => 
            file.applause_segments && file.applause_segments.some(segment => segment.selected !== false)
        );
        
        this.splitButton.disabled = !hasSelectedSegments;
    }

    async splitVideos() {
        if (!confirm('This will create video segments based on the selected applause times. Continue?')) {
            return;
        }

        this.splitButton.disabled = true;
        this.splitProgress.classList.add('show');
        
        const selectedFiles = this.analyzedFiles.filter(file => 
            file.applause_segments && file.applause_segments.some(segment => segment.selected !== false)
        );

        let totalSegments = 0;
        let completedSegments = 0;

        // Count total segments to process
        selectedFiles.forEach(file => {
            file.applause_segments.forEach(segment => {
                if (segment.selected !== false) {
                    totalSegments++;
                }
            });
        });

        // Track tag counts for naming
        const tagCounts = {};

        for (const file of selectedFiles) {
            const selectedSegments = file.applause_segments.filter(segment => segment.selected !== false);
            
            for (let i = 0; i < selectedSegments.length; i++) {
                const segment = selectedSegments[i];
                const previousSegment = i > 0 ? selectedSegments[i - 1] : null;
                
                // Calculate start and end times for the segment
                const segmentEnd = this.parseTime(segment.end_time);
                const segmentStart = previousSegment ? this.parseTime(previousSegment.end_time) : 0;
                
                // Generate filename based on tags
                let filename = this.generateSegmentFilename(file.filename, segment, tagCounts);
                
                await this.createVideoSegment(file.filename, segmentStart, segmentEnd, filename);
                
                completedSegments++;
                const progress = (completedSegments / totalSegments) * 100;
                this.splitProgressBar.style.width = `${progress}%`;
                this.splitStatus.textContent = `Processing segment ${completedSegments} of ${totalSegments}...`;
            }
        }

        this.splitStatus.textContent = 'Video splitting completed!';
        this.splitButton.disabled = false;
        
        setTimeout(() => {
            this.splitProgress.classList.remove('show');
        }, 3000);
    }

    generateSegmentFilename(originalFilename, segment, tagCounts) {
        const baseName = originalFilename.replace(/\.[^/.]+$/, ""); // Remove extension
        
        if (segment.tags && segment.tags.length > 0) {
            // Use the first tag for naming
            const tag = segment.tags[0];
            
            // Initialize count for this tag if not exists
            if (!tagCounts[tag]) {
                tagCounts[tag] = 0;
            }
            tagCounts[tag]++;
            
            // Generate filename: Tag-1.mov, Tag-2.mov, etc.
            const count = tagCounts[tag];
            return `${tag}-${count}.mov`;
        } else {
            // Fallback to original naming scheme
            return `${baseName}_segment_001.mov`;
        }
    }

    async createVideoSegment(filename, startTime, endTime, outputFilename) {
        try {
            const response = await fetch('/api/split-video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: filename,
                    startTime: startTime,
                    endTime: endTime,
                    outputFilename: outputFilename
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create segment: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`Created segment: ${result.outputFile}`);
        } catch (error) {
            console.error('Error creating video segment:', error);
            this.splitStatus.textContent = `Error creating segment: ${error.message}`;
        }
    }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = {
        splitterUI: new SoundSplitterUI()
    };
}); 