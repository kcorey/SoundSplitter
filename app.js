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
        
        // Initialize default presenters storage
        this.defaultPresenters = JSON.parse(localStorage.getItem('defaultPresenters') || '{}');
        
        // Initialize toastmaster storage
        this.toastmaster = localStorage.getItem('toastmaster') || null;
        
        // Extraction control
        this.isExtracting = false;
        this.shouldStopExtraction = false;
        
        this.initializeEventListeners();
        this.loadAnalyzedFiles();
        this.loadPresenters();
    }

    initializeEventListeners() {
        this.splitButton.addEventListener('click', () => {
            if (this.isExtracting) {
                this.stopExtraction();
            } else {
                this.splitVideos();
            }
        });
        
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
            
            // Try to load detected toastmaster
            await this.loadDetectedToastmaster();
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

    async loadDetectedToastmaster() {
        try {
            const response = await fetch('/api/toastmaster');
            if (response.ok) {
                const data = await response.json();
                if (data.toastmaster && data.toastmaster.trim() !== '') {
                    console.log('Detected toastmaster:', data.toastmaster);
                    this.setToastmaster(data.toastmaster);
                    
                    // Automatically apply toastmaster to all segments
                    setTimeout(() => {
                        this.addToastmasterToAllSegments();
                    }, 1000); // Small delay to ensure UI is rendered
                }
            }
        } catch (error) {
            console.error('Error loading detected toastmaster:', error);
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
        const toastmaster = this.getToastmaster();
        
        document.getElementById('presenterTags').innerHTML = `
            <div class="presenter-tags">
                ${uniquePresenters.map(presenter => `
                    <span class="badge bg-info me-2 mb-2" draggable="true" data-presenter="${presenter}">
                        ${presenter}
                    </span>
                `).join('')}
                <div class="mt-3">
                    <span class="badge bg-warning me-2 mb-2" draggable="true" data-presenter="custom" 
                          onclick="app.splitterUI.createCustomTag()" style="cursor: pointer; border: 2px dashed #ffc107;">
                        <i class="fas fa-edit me-1"></i>
                        Custom Tag
                    </span>
                </div>
                <div class="mt-3 p-2 border border-dashed border-secondary rounded" 
                     data-toastmaster-drop="true" 
                     style="background-color: #f8f9fa; min-height: 60px; display: flex; align-items: center; justify-content: center;">
                    ${toastmaster ? `
                        <div class="text-center">
                            <span class="badge bg-success mb-2">
                                <i class="fas fa-crown me-1"></i>
                                Toastmaster: ${toastmaster}
                            </span>
                            <br>
                            <small class="text-muted">Click to change</small>
                            <br>
                            <button class="btn btn-sm btn-outline-success mt-2" 
                                    onclick="app.splitterUI.addToastmasterToAllSegments()">
                                <i class="fas fa-magic me-1"></i>
                                Apply to All Segments
                            </button>
                        </div>
                    ` : `
                        <div class="text-center text-muted">
                            <i class="fas fa-crown me-2"></i>
                            Drop the toastmaster here
                        </div>
                    `}
                    

                </div>
            </div>
        `;

        // Initialize drag and drop after rendering presenter tags
        this.initializeDragAndDrop();
        
        // Initialize sensitivity slider
        this.initializeSensitivitySlider();
    }

    initializeDragAndDrop() {
        // Make presenter tags draggable
        const presenterTags = document.querySelectorAll('.presenter-tags .badge');
        presenterTags.forEach(tag => {
            // Remove existing event listeners to avoid duplicates
            tag.removeEventListener('dragstart', tag._dragStartHandler);
            
            // Create new handler
            tag._dragStartHandler = (e) => {
                e.dataTransfer.setData('text/plain', tag.dataset.presenter);
                console.log('Dragging presenter:', tag.dataset.presenter);
            };
            
            tag.addEventListener('dragstart', tag._dragStartHandler);
        });

        // Make segment containers droppable
        const segmentItems = document.querySelectorAll('.segment-item');
        segmentItems.forEach(item => {
            // Remove existing event listeners to avoid duplicates
            item.removeEventListener('dragover', item._dragOverHandler);
            item.removeEventListener('dragleave', item._dragLeaveHandler);
            item.removeEventListener('drop', item._dropHandler);
            
            // Create new handlers
            item._dragOverHandler = (e) => {
                e.preventDefault();
                item.style.backgroundColor = '#e3f2fd';
            };
            
            item._dragLeaveHandler = (e) => {
                item.style.backgroundColor = '';
            };
            
            item._dropHandler = (e) => {
                e.preventDefault();
                item.style.backgroundColor = '';
                const presenter = e.dataTransfer.getData('text/plain');
                const filename = item.dataset.filename;
                const index = parseInt(item.dataset.index);
                
                // Check if dropping on an existing tag
                const targetTag = e.target.closest('[data-tag]');
                if (targetTag) {
                    // Replace the existing tag
                    const oldTag = targetTag.dataset.tag;
                    console.log('Replacing tag:', oldTag, 'with:', presenter);
                    this.replaceTag(filename, index, oldTag, presenter);
                } else {
                    // Add new tag
                    console.log('Adding presenter:', presenter, 'to segment:', filename, index);
                    this.addTag(filename, index, presenter);
                }
            };
            
            item.addEventListener('dragover', item._dragOverHandler);
            item.addEventListener('dragleave', item._dragLeaveHandler);
            item.addEventListener('drop', item._dropHandler);
        });

        // Make file headers droppable for default presenters
        const fileHeaders = document.querySelectorAll('[data-droppable="true"]');
        fileHeaders.forEach(header => {
            // Remove existing event listeners to avoid duplicates
            header.removeEventListener('dragover', header._dragOverHandler);
            header.removeEventListener('dragleave', header._dragLeaveHandler);
            header.removeEventListener('drop', header._dropHandler);
            
            // Create new handlers
            header._dragOverHandler = (e) => {
                e.preventDefault();
                header.style.backgroundColor = '#e8f5e8';
            };
            
            header._dragLeaveHandler = (e) => {
                header.style.backgroundColor = '';
            };
            
            header._dropHandler = (e) => {
                e.preventDefault();
                header.style.backgroundColor = '';
                const presenter = e.dataTransfer.getData('text/plain');
                const filename = header.dataset.filename;
                console.log('Dropping presenter:', presenter, 'onto file header:', filename);
                this.setDefaultPresenter(filename, presenter);
            };
            
            header.addEventListener('dragover', header._dragOverHandler);
            header.addEventListener('dragleave', header._dragLeaveHandler);
            header.addEventListener('drop', header._dropHandler);
        });

        // Make toastmaster drop zone droppable
        const toastmasterDropZone = document.querySelector('[data-toastmaster-drop="true"]');
        if (toastmasterDropZone) {
            // Remove existing event listeners to avoid duplicates
            toastmasterDropZone.removeEventListener('dragover', toastmasterDropZone._dragOverHandler);
            toastmasterDropZone.removeEventListener('dragleave', toastmasterDropZone._dragLeaveHandler);
            toastmasterDropZone.removeEventListener('drop', toastmasterDropZone._dropHandler);
            toastmasterDropZone.removeEventListener('click', toastmasterDropZone._clickHandler);
            
            // Create new handlers
            toastmasterDropZone._dragOverHandler = (e) => {
                e.preventDefault();
                toastmasterDropZone.style.backgroundColor = '#e8f5e8';
                toastmasterDropZone.style.borderColor = '#28a745';
            };
            
            toastmasterDropZone._dragLeaveHandler = (e) => {
                toastmasterDropZone.style.backgroundColor = '#f8f9fa';
                toastmasterDropZone.style.borderColor = '#6c757d';
            };
            
            toastmasterDropZone._dropHandler = (e) => {
                e.preventDefault();
                toastmasterDropZone.style.backgroundColor = '#f8f9fa';
                toastmasterDropZone.style.borderColor = '#6c757d';
                const presenter = e.dataTransfer.getData('text/plain');
                console.log('Setting toastmaster:', presenter);
                this.setToastmaster(presenter);
            };
            
            toastmasterDropZone._clickHandler = (e) => {
                if (this.getToastmaster()) {
                    this.setToastmaster(null);
                }
            };
            
            toastmasterDropZone.addEventListener('dragover', toastmasterDropZone._dragOverHandler);
            toastmasterDropZone.addEventListener('dragleave', toastmasterDropZone._dragLeaveHandler);
            toastmasterDropZone.addEventListener('drop', toastmasterDropZone._dropHandler);
            toastmasterDropZone.addEventListener('click', toastmasterDropZone._clickHandler);
        }
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
        
        // Initialize drag and drop after rendering
        this.initializeDragAndDrop();
        this.initializeTimeEditing();
    }

    renderFileSection(file) {
        const segments = file.applause_segments || [];
        const defaultPresenter = this.getDefaultPresenter(file.filename);
        
        return `
            <div class="file-section mb-3">
                <div class="file-header p-3 bg-light border-bottom" 
                     data-filename="${file.filename}" 
                     data-droppable="true">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 text-muted">
                            <i class="fas fa-video me-2"></i>
                            ${file.filename}
                        </h6>
                        <div class="default-presenter">
                            ${defaultPresenter ? `
                                <span class="badge bg-success">
                                    <i class="fas fa-user me-1"></i>
                                    ${defaultPresenter}
                                </span>
                            ` : `
                                <span class="badge bg-secondary">
                                    <i class="fas fa-plus me-1"></i>
                                    Drop presenter here
                                </span>
                            `}
                        </div>
                    </div>
                </div>
                <div class="segments-container">
                    ${segments.map((segment, index) => {
                        let html = this.renderSegmentItem(segment, file.filename, index);
                        
                        // Add separator with add button between segments
                        if (index < segments.length - 1) {
                            html += `
                                <div class="segment-separator p-2 text-center border-top" data-filename="${file.filename}" data-index="${index}">
                                    <button class="btn btn-sm btn-outline-success segment-btn-add" onclick="app.splitterUI.addSegment('${file.filename}', ${index})">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            `;
                        }
                        
                        return html;
                    }).join('')}
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
                                    <span class="editable-time" data-type="start" data-filename="${filename}" data-index="${index}">${segment.start_time}</span> - 
                                    <span class="editable-time" data-type="end" data-filename="${filename}" data-index="${index}">${segment.end_time}</span>
                                    <span class="badge bg-secondary ms-2">${segment.duration}</span>
                                </div>
                                <small class="text-muted">
                                    Confidence: <span class="${confidenceClass}">${(segment.confidence * 100).toFixed(0)}%</span>
                                </small>
                                <div class="tags-container mt-1" data-filename="${filename}" data-index="${index}">
                                    ${(segment.tags || []).map(tag => `
                                        <span class="badge bg-primary me-1" draggable="true" data-tag="${tag}" 
                                              ondblclick="event.stopPropagation(); app.splitterUI.editCustomTag('${filename}', ${index}, '${tag}')">
                                            ${tag.startsWith('Custom:') ? tag : tag} 
                                            <i class="fas fa-times ms-1" onclick="event.stopPropagation(); app.splitterUI.removeTag('${filename}', ${index}, '${tag}')"></i>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="text-end">
                        <button class="btn btn-sm btn-outline-danger segment-item-remove" onclick="event.stopPropagation(); app.splitterUI.removeSegment('${filename}', ${index})">
                            <i class="fas fa-minus"></i>
                        </button>
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
            
            // Store scroll position before re-rendering
            const segmentList = document.querySelector('.segment-list');
            const scrollTop = segmentList ? segmentList.scrollTop : 0;
            
            this.renderFileList();
            this.updateSplitButton();
            
            // Restore scroll position after re-rendering
            const newSegmentList = document.querySelector('.segment-list');
            if (newSegmentList) {
                newSegmentList.scrollTop = scrollTop;
            }
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
                
                // Store scroll position before re-rendering
                const segmentList = document.querySelector('.segment-list');
                const scrollTop = segmentList ? segmentList.scrollTop : 0;
                
                this.renderFileList();
                this.initializeDragAndDrop(); // Re-initialize drag and drop after re-rendering
                
                // Restore scroll position after re-rendering
                const newSegmentList = document.querySelector('.segment-list');
                if (newSegmentList) {
                    newSegmentList.scrollTop = scrollTop;
                }
            }
        }
    }

    removeTag(filename, index, tag) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (file && file.applause_segments[index]) {
            if (file.applause_segments[index].tags) {
                file.applause_segments[index].tags = file.applause_segments[index].tags.filter(t => t !== tag);
                
                // Store scroll position before re-rendering
                const segmentList = document.querySelector('.segment-list');
                const scrollTop = segmentList ? segmentList.scrollTop : 0;
                
                this.renderFileList();
                this.initializeDragAndDrop(); // Re-initialize drag and drop after re-rendering
                
                // Restore scroll position after re-rendering
                const newSegmentList = document.querySelector('.segment-list');
                if (newSegmentList) {
                    newSegmentList.scrollTop = scrollTop;
                }
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



    async splitVideos() {
        // Generate the extraction plan first
        const extractionPlan = this.generateExtractionPlan();
        
        if (extractionPlan.length === 0) {
            alert('No segments selected for extraction.');
            return;
        }
        
        // Show detailed confirmation dialog with selectable text
        const first10Items = extractionPlan.slice(0, 10);
        const planText = first10Items.map((item, index) => 
            `${index + 1}. ${item.filename}\n   Time: ${item.startTime} → ${item.endTime}\n   Duration: ${item.duration}\n   Output: ${item.outputName}`
        ).join('\n\n');
        
        const remainingCount = extractionPlan.length - 10;
        const remainingText = remainingCount > 0 ? `\n\n... and ${remainingCount} more segments` : '';
        
        const fullPlanText = `Extraction Plan:\n\n${planText}${remainingText}\n\nTotal segments: ${extractionPlan.length}\n\nDo you want to proceed with this extraction?`;
        
        // Create a textarea for selectable text
        const textarea = document.createElement('textarea');
        textarea.value = fullPlanText;
        textarea.style.width = '600px';
        textarea.style.height = '400px';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.readOnly = true;
        
        // Create modal dialog
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '10000';
        
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.maxWidth = '80%';
        modalContent.style.maxHeight = '80%';
        modalContent.style.overflow = 'auto';
        
        const title = document.createElement('h4');
        title.textContent = 'Extraction Plan';
        title.style.marginBottom = '15px';
        
        const description = document.createElement('p');
        description.textContent = 'Review the extraction plan below. You can select and copy the text:';
        description.style.marginBottom = '10px';
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '15px';
        buttonContainer.style.textAlign = 'right';
        
        const proceedButton = document.createElement('button');
        proceedButton.textContent = 'Proceed';
        proceedButton.className = 'btn btn-success me-2';
        proceedButton.onclick = () => {
            document.body.removeChild(modal);
            this.executeExtraction(extractionPlan);
        };
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.onclick = () => {
            document.body.removeChild(modal);
        };
        
        buttonContainer.appendChild(proceedButton);
        buttonContainer.appendChild(cancelButton);
        
        modalContent.appendChild(title);
        modalContent.appendChild(description);
        modalContent.appendChild(textarea);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    async executeExtraction(extractionPlan) {

        this.isExtracting = true;
        this.shouldStopExtraction = false;
        this.updateSplitButton();
        this.splitProgress.classList.add('show');
        
        // Reset progress bar
        this.splitProgressBar.style.width = '0%';
        this.splitStatus.textContent = 'Starting extraction...';
        
        const selectedFiles = this.analyzedFiles.filter(file => 
            file.applause_segments && file.applause_segments.some(segment => segment.selected !== false)
        );

        let totalSegments = extractionPlan.length;
        let completedSegments = 0;

        // Reset tag counts for naming (start fresh each time)
        const tagCounts = {};

                try {
            for (const item of extractionPlan) {
                // Check if user wants to stop
                if (this.shouldStopExtraction) {
                    break;
                }

                const startTime = this.parseTime(item.startTime);
                const endTime = this.parseTime(item.endTime);
                
                await this.createVideoSegment(item.filename, startTime, endTime, item.outputName);
                
                completedSegments++;
                const progress = (completedSegments / totalSegments) * 100;
                this.splitProgressBar.style.width = `${progress}%`;
                this.splitStatus.textContent = `Processing segment ${completedSegments} of ${totalSegments}...`;
            }

            if (this.shouldStopExtraction) {
                this.splitStatus.textContent = 'Video splitting stopped by user.';
            } else {
                this.splitStatus.textContent = 'Video splitting completed!';
            }
        } catch (error) {
            console.error('Error during video splitting:', error);
            this.splitStatus.textContent = `Error: ${error.message}`;
        } finally {
            this.isExtracting = false;
            this.shouldStopExtraction = false;
            this.updateSplitButton();
            
            setTimeout(() => {
                this.splitProgress.classList.remove('show');
            }, 3000);
        }
    }

    stopExtraction() {
        this.shouldStopExtraction = true;
        this.splitStatus.textContent = 'Stopping extraction...';
    }

    generateExtractionPlan() {
        const plan = [];
        const selectedFiles = this.analyzedFiles.filter(file => 
            file.applause_segments && file.applause_segments.some(segment => segment.selected !== false)
        );

        for (const file of selectedFiles) {
            const allSegments = file.applause_segments;
            const selectedSegments = allSegments.filter(segment => segment.selected !== false);
            
            if (selectedSegments.length === 0) {
                continue;
            }
            
            // Find the first selected segment in the original order
            let firstSelectedIndex = -1;
            for (let i = 0; i < allSegments.length; i++) {
                if (allSegments[i].selected !== false) {
                    firstSelectedIndex = i;
                    break;
                }
            }
            
            if (firstSelectedIndex === -1) {
                continue;
            }
            
            // Create a list of selected segments in their original order
            const orderedSelectedSegments = [];
            for (let i = 0; i < allSegments.length; i++) {
                if (allSegments[i].selected !== false) {
                    orderedSelectedSegments.push({
                        index: i,
                        segment: allSegments[i]
                    });
                }
            }
            
            // First segment: 0:00 to end of first selected applause (use video header default presenter)
            const firstSelectedSegment = orderedSelectedSegments[0].segment;
            const firstSegmentEnd = this.parseTime(firstSelectedSegment.end_time);
            const firstStartTime = '0:00';
            const firstEndTime = firstSelectedSegment.end_time;
            const firstDuration = this.formatDuration(firstSegmentEnd);
            
            // Generate filename for first segment using video header default presenter
            let firstOutputName;
            const defaultPresenter = this.getDefaultPresenter(file.filename);
            if (defaultPresenter) {
                // Check for filename collisions in the entire plan
                let presenterCount = 1;
                let proposedName = `${defaultPresenter}-${presenterCount}.mov`;
                
                // Keep incrementing until we find a unique filename
                while (plan.some(item => item.outputName === proposedName)) {
                    presenterCount++;
                    proposedName = `${defaultPresenter}-${presenterCount}.mov`;
                }
                
                firstOutputName = proposedName;
            } else {
                firstOutputName = `${file.filename.replace(/\.[^/.]+$/, "")}_segment_001.mov`;
            }
            
            plan.push({
                filename: file.filename,
                startTime: firstStartTime,
                endTime: firstEndTime,
                duration: firstDuration,
                outputName: firstOutputName
            });
            
            // Process all selected segments
            for (let segmentIndex = 0; segmentIndex < orderedSelectedSegments.length-1; segmentIndex++) {
                const currentSegmentInfo = orderedSelectedSegments[segmentIndex];
                const currentSegment = currentSegmentInfo.segment;
                
                let segmentStart, segmentEnd, duration;
                
                // if (segmentIndex === 0) {
                    segmentStart = currentSegment.start_time;
                    const nextSegmentInfo = orderedSelectedSegments[segmentIndex + 1];
                    segmentEnd = nextSegmentInfo.segment.end_time;
                // } else {
                //     // Other segments: previous applause to current applause
                //     const previousSegmentInfo = orderedSelectedSegments[segmentIndex - 1];
                //     const previousSegment = previousSegmentInfo.segment;
                //     segmentStart = previousSegment.start_time;
                //     segmentEnd = currentSegment.end_time;
                // }
                
                const startSeconds = this.parseTime(segmentStart);
                const endSeconds = this.parseTime(segmentEnd);
                duration = this.formatDuration(endSeconds - startSeconds);
                
                // Debug logging
                console.log(`Segment ${segmentIndex}: ${segmentStart} - ${segmentEnd}, Tags:`, currentSegment.tags);
                
                // Generate filename based on tags from the current segment
                let outputName;
                if (currentSegment.tags && currentSegment.tags.length > 0) {
                    const tag = currentSegment.tags[0];
                    const presenterName = tag.startsWith('Custom:') ? tag.replace('Custom:', '') : tag;
                    
                    // Check for filename collisions in the entire plan
                    let presenterCount = 1;
                    let proposedName = `${presenterName}-${presenterCount}.mov`;
                    
                    // Keep incrementing until we find a unique filename
                    while (plan.some(item => item.outputName === proposedName)) {
                        presenterCount++;
                        proposedName = `${presenterName}-${presenterCount}.mov`;
                    }
                    
                    outputName = proposedName;
                    console.log(`Using tag "${tag}" for segment ${segmentIndex} -> ${outputName}`);
                } else {
                    outputName = `${file.filename.replace(/\.[^/.]+$/, "")}_segment_${String(currentSegmentInfo.index + 1).padStart(3, '0')}.mov`;
                    console.log(`No tags for segment ${segmentIndex} -> ${outputName}`);
                }
                
                plan.push({
                    filename: file.filename,
                    startTime: segmentStart,
                    endTime: segmentEnd,
                    duration: duration,
                    outputName: outputName
                });
            }
        }
        
        return plan;
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updateSplitButton() {
        const hasSelectedSegments = this.analyzedFiles.some(file => 
            file.applause_segments && file.applause_segments.some(segment => segment.selected !== false)
        );
        
        if (this.isExtracting) {
            this.splitButton.textContent = 'Stop';
            this.splitButton.className = 'btn btn-danger btn-lg';
            this.splitButton.disabled = false;
        } else {
            this.splitButton.textContent = 'Split Videos';
            this.splitButton.className = 'btn btn-success btn-lg';
            this.splitButton.disabled = !hasSelectedSegments;
        }
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

    // Default presenter methods
    setDefaultPresenter(filename, presenter) {
        this.defaultPresenters[filename] = presenter;
        localStorage.setItem('defaultPresenters', JSON.stringify(this.defaultPresenters));
        this.renderFileList();
        this.initializeDragAndDrop();
    }

    getDefaultPresenter(filename) {
        return this.defaultPresenters[filename] || null;
    }

    // Toastmaster methods
    setToastmaster(presenter) {
        this.toastmaster = presenter;
        localStorage.setItem('toastmaster', presenter || '');
        this.renderPresenterTags();
        this.initializeDragAndDrop();
    }

    getToastmaster() {
        return this.toastmaster;
    }

    // Add toastmaster to all segments
    addToastmasterToAllSegments() {
        if (!this.toastmaster) return;
        
        this.analyzedFiles.forEach(file => {
            file.applause_segments.forEach(segment => {
                if (!segment.tags) {
                    segment.tags = [];
                }
                if (!segment.tags.includes(this.toastmaster)) {
                    segment.tags.push(this.toastmaster);
                }
            });
        });
        
        this.renderFileList();
        this.initializeDragAndDrop();
    }

    // Custom tag methods
    createCustomTag() {
        const customName = prompt('Enter the presenter name:');
        if (customName && customName.trim()) {
            // Add to presenters list
            if (!this.presenters) {
                this.presenters = [];
            }
            this.presenters.push({ presenter: customName.trim() });
            
            // Re-render presenter tags
            this.renderPresenterTags();
            
            console.log('Created custom tag:', customName);
        }
    }

    editCustomTag(filename, index, tag) {
        if (tag.startsWith('Custom:')) {
            const currentName = tag.replace('Custom:', '');
            const newName = prompt('Edit presenter name:', currentName);
            if (newName && newName.trim() && newName !== currentName) {
                this.replaceTag(filename, index, tag, `Custom:${newName.trim()}`);
            }
        } else {
            // Convert regular tag to custom tag
            const newName = prompt('Enter custom presenter name:', tag);
            if (newName && newName.trim()) {
                this.replaceTag(filename, index, tag, `Custom:${newName.trim()}`);
            }
        }
    }

    replaceTag(filename, index, oldTag, newTag) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (file && file.applause_segments[index]) {
            if (file.applause_segments[index].tags) {
                const tagIndex = file.applause_segments[index].tags.indexOf(oldTag);
                if (tagIndex !== -1) {
                    file.applause_segments[index].tags[tagIndex] = newTag;
                    
                    // Store scroll position before re-rendering
                    const segmentList = document.querySelector('.segment-list');
                    const scrollTop = segmentList ? segmentList.scrollTop : 0;
                    
                    this.renderFileList();
                    this.initializeDragAndDrop();
                    
                    // Restore scroll position after re-rendering
                    const newSegmentList = document.querySelector('.segment-list');
                    if (newSegmentList) {
                        newSegmentList.scrollTop = scrollTop;
                    }
                }
            }
        }
    }

    // Override generateSegmentFilename to use default presenters
    generateSegmentFilename(originalFilename, segment, tagCounts) {
        const baseName = originalFilename.replace(/\.[^/.]+$/, ""); // Remove extension
        
        // Check if segment has tags
        if (segment.tags && segment.tags.length > 0) {
            // Use the first tag for naming
            const tag = segment.tags[0];
            
            // Handle custom tags
            let presenterName = tag;
            if (tag.startsWith('Custom:')) {
                presenterName = tag.replace('Custom:', '');
            }
            
            // Initialize count for this presenter if not exists
            if (!tagCounts[presenterName]) {
                tagCounts[presenterName] = 0;
            }
            tagCounts[presenterName]++;
            
            // Generate filename: Presenter-1.mov, Presenter-2.mov, etc.
            const count = tagCounts[presenterName];
            return `${presenterName}-${count}.mov`;
        } else {
            // Check for default presenter
            const defaultPresenter = this.getDefaultPresenter(originalFilename);
            if (defaultPresenter) {
                // Initialize count for this presenter if not exists
                if (!tagCounts[defaultPresenter]) {
                    tagCounts[defaultPresenter] = 0;
                }
                tagCounts[defaultPresenter]++;
                
                const count = tagCounts[defaultPresenter];
                return `${defaultPresenter}-${count}.mov`;
            } else {
                // Fallback to original naming scheme
                return `${baseName}_segment_001.mov`;
            }
        }
    }

    // Segment management methods
    addSegment(filename, index) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (!file) return;

        // Get the current segment to calculate midpoint
        const currentSegment = file.applause_segments[index];
        const nextSegment = file.applause_segments[index + 1];
        
        let startTime, endTime;
        if (nextSegment) {
            // Insert between current and next segment
            startTime = currentSegment.end_time;
            endTime = nextSegment.start_time;
        } else {
            // Add at the end, 30 seconds after current segment
            const currentEnd = this.parseTime(currentSegment.end_time);
            startTime = this.formatTime(currentEnd);
            endTime = this.formatTime(currentEnd + 30);
        }

        // Create new segment
        const newSegment = {
            start_time: startTime,
            end_time: endTime,
            duration: this.formatTime(this.parseTime(endTime) - this.parseTime(startTime)),
            confidence: 0.5,
            rhythm_score: 0.5,
            transient_count: 1,
            selected: true,
            tags: []
        };

        // Insert the new segment
        file.applause_segments.splice(index + 1, 0, newSegment);
        
        this.renderFileList();
        
        // Scroll to the newly added segment instantly
        requestAnimationFrame(() => {
            const newSegmentElement = document.querySelector(`[data-filename="${filename}"][data-index="${index + 1}"]`);
            if (newSegmentElement) {
                newSegmentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
        });
        
        this.updateSplitButton();
    }

    removeSegment(filename, index) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (!file || !file.applause_segments[index]) return;

        file.applause_segments.splice(index, 1);
        this.renderFileList();
        
        // Scroll to the segment that was after the removed one (now at the same index) instantly
        requestAnimationFrame(() => {
            const nextSegmentElement = document.querySelector(`[data-filename="${filename}"][data-index="${index}"]`);
            if (nextSegmentElement) {
                nextSegmentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
        });
        
        this.updateSplitButton();
    }

    // Time editing methods
    initializeTimeEditing() {
        const editableTimes = document.querySelectorAll('.editable-time');
        editableTimes.forEach(element => {
            element.addEventListener('mousedown', this.handleTimeEditStart.bind(this));
        });
    }

    handleTimeEditStart(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const element = event.target;
        const filename = element.dataset.filename;
        const index = parseInt(element.dataset.index);
        const type = element.dataset.type;
        
        let startX = event.clientX;
        let startTime = this.parseTime(element.textContent);
        
        const handleMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const timeDelta = Math.round(deltaX / 10); // 10 pixels = 1 second
            
            let newTime = startTime + timeDelta;
            
            // Ensure time is within bounds
            const file = this.analyzedFiles.find(f => f.filename === filename);
            if (file && file.applause_segments[index]) {
                const segment = file.applause_segments[index];
                
                if (type === 'start') {
                    const endTime = this.parseTime(segment.end_time);
                    newTime = Math.max(0, Math.min(newTime, endTime - 1)); // At least 1 second duration
                } else if (type === 'end') {
                    const startTime = this.parseTime(segment.start_time);
                    newTime = Math.max(startTime + 1, newTime); // At least 1 second duration
                }
            }
            
            element.textContent = this.formatTime(newTime);
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Update the segment data
            const file = this.analyzedFiles.find(f => f.filename === filename);
            if (file && file.applause_segments[index]) {
                const segment = file.applause_segments[index];
                const newTime = this.parseTime(element.textContent);
                
                if (type === 'start') {
                    segment.start_time = element.textContent;
                } else if (type === 'end') {
                    segment.end_time = element.textContent;
                }
                
                // Update duration
                const startTime = this.parseTime(segment.start_time);
                const endTime = this.parseTime(segment.end_time);
                segment.duration = this.formatTime(endTime - startTime);
                
                // Update duration display in UI
                this.updateDurationDisplay(filename, index, segment.duration);
                
                this.updateSplitButton();
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    updateDurationDisplay(filename, index, duration) {
        const segmentElement = document.querySelector(`[data-filename="${filename}"][data-index="${index}"]`);
        if (segmentElement) {
            const durationElement = segmentElement.querySelector('.duration');
            if (durationElement) {
                durationElement.textContent = duration;
            }
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Sensitivity slider methods
    initializeSensitivitySlider() {
        const slider = document.getElementById('sensitivitySlider');
        const valueDisplay = document.getElementById('sensitivityValue');
        
        if (slider && valueDisplay) {
            // Update value display when slider changes
            slider.addEventListener('input', (e) => {
                valueDisplay.textContent = e.target.value;
            });
            
            // Re-run detection when slider is released
            slider.addEventListener('change', (e) => {
                this.updateDetectionSensitivity(parseInt(e.target.value));
            });
            
            // Show initial stats
            this.updateDetectionStats();
        }
    }
    
    updateDetectionSensitivity(sensitivity) {
        // Map sensitivity (1-10) to detection parameters
        const sensitivityParams = this.getSensitivityParameters(sensitivity);
        
        // Show loading state
        this.showDetectionLoading();
        
        // Re-run applause detection with new parameters
        this.runApplauseDetection(sensitivityParams).then(() => {
            this.loadAnalyzedFiles().then(() => {
                this.renderFileList();
                this.updateDetectionStats();
                this.hideDetectionLoading();
            });
        });
    }
    
    getSensitivityParameters(sensitivity) {
        // Map sensitivity 1-10 to detection parameters
        // The backend now uses a single sensitivity parameter (1-10)
        // Higher sensitivity = more detections, Lower sensitivity = fewer detections
        const params = {
            sensitivity: sensitivity, // 1-10 scale
            minDuration: Math.max(1, 4 - sensitivity * 0.3) // 1.0 to 1.7 seconds
        };
        
        return params;
    }
    
    async runApplauseDetection(params) {
        // Run the applause detector with new sensitivity-based parameters
        const videoFiles = this.getVideoFiles();
        
        for (const videoFile of videoFiles) {
            try {
                // Use fetch to call a backend endpoint that will run the command
                const response = await fetch('/api/run-detection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        videoFile: videoFile,
                        params: params
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Detection failed');
                }
                
                console.log('Detection completed for:', videoFile, 'with sensitivity:', params.sensitivity);
            } catch (error) {
                console.error('Failed to run applause detection:', error);
            }
        }
    }
    
    getVideoFiles() {
        // Get list of video files in the current directory
        const videoExtensions = ['.mov', '.MOV', '.mp4', '.MP4', '.avi', '.AVI'];
        // This would need to be implemented to scan for video files
        // For now, return a default list
        return ['IMG_2333.MOV']; // You can expand this list
    }
    
    showDetectionLoading() {
        const statsDiv = document.getElementById('detectionStats');
        if (statsDiv) {
            statsDiv.innerHTML = `
                <div class="text-center">
                    <i class="fas fa-spinner fa-spin me-2"></i>
                    Re-running detection...
                </div>
            `;
        }
    }
    
    hideDetectionLoading() {
        // Loading state will be cleared when stats are updated
    }
    
    updateDetectionStats() {
        const statsDiv = document.getElementById('detectionStats');
        if (statsDiv && this.analyzedFiles.length > 0) {
            const stats = this.analyzedFiles.map(file => {
                const segmentCount = file.applause_segments ? file.applause_segments.length : 0;
                return `${file.filename}: ${segmentCount} events`;
            }).join(', ');
            
            statsDiv.innerHTML = `
                <div class="text-muted">
                    <i class="fas fa-chart-bar me-1"></i>
                    ${stats}
                </div>
            `;
        }
    }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = {
        splitterUI: new SoundSplitterUI()
    };
    
    // Set window name for consistent loading
    if (window.name !== 'SoundSplitter') {
        window.name = 'SoundSplitter';
    }
}); 