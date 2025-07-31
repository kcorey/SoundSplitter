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
        
        // Undo system
        this.actionStack = [];
        this.maxUndoActions = 20; // Maximum number of actions to remember
        
        // State persistence
        this.stateCookieName = 'soundSplitterState';
        
        this.initializeEventListeners();
        this.loadAnalyzedFiles();
        this.loadPresenters();
        this.loadDetectedToastmaster();
        this.initializeSensitivitySlider();
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
        

        
        // Keyboard shortcuts for undo
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                this.undoLastAction();
            }
        });
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
            this.presenters = [];
        }
    }

    async parsePresenterString(presenterString) {
        try {
            const response = await fetch('/api/parse-presenters', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ presenterString })
            });
            
            if (!response.ok) {
                throw new Error('Failed to parse presenters');
            }
            
            const newPresenters = await response.json();
            
            // Append new presenters to existing ones, avoiding duplicates
            if (this.presenters && this.presenters.length > 0) {
                const existingNames = new Set(this.presenters.map(p => p.presenter));
                const uniqueNewPresenters = newPresenters.filter(p => !existingNames.has(p.presenter));
                this.presenters = [...this.presenters, ...uniqueNewPresenters];
            } else {
                this.presenters = newPresenters;
            }
            
            this.renderPresenterTags();
            
            // Save state after adding presenters
            this.saveState();
            
            return this.presenters;
        } catch (error) {
            console.error('Error parsing presenters:', error);
            return [];
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
        const uniquePresenters = this.presenters && this.presenters.length > 0 
            ? [...new Set(this.presenters.map(p => p.presenter))].sort() 
            : [];
        const toastmaster = this.getToastmaster();
        
        document.getElementById('presenterTags').innerHTML = `
            <div class="presenter-tags">
                ${uniquePresenters.map(presenter => `
                    <span class="badge bg-info me-2 mb-2" draggable="true" data-presenter="${presenter}">
                        ${presenter}
                        <i class="fas fa-times ms-1" 
                           style="cursor: pointer; font-size: 0.8em;" 
                           title="Delete this tag"
                           onclick="app.splitterUI.deletePresenterTag('${presenter}')"></i>
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
            
            <!-- Manual Presenter Input -->
            <div class="mt-4 p-3 border-top">
                <label for="presenterInput" class="form-label">
                    Enter Presenter Names (comma-separated):
                    <i class="fas fa-info-circle text-primary ms-1" 
                       style="cursor: pointer;" 
                       data-bs-toggle="modal" 
                       data-bs-target="#presenterInfoModal"></i>
                </label>
                <div class="input-group">
                    <input type="text" class="form-control" id="presenterInput" 
                           placeholder="e.g., Aleesha & George, Patricia, Drew, Liam, Fin, Kate & Sims, Ciaran, Som, Jess, Jo, Chris, Kishan, Joy, Katie, Tim, Russel, Ken">
                    <button class="btn btn-primary" type="button" id="parsePresentersBtn">
                        <i class="fas fa-parse me-1"></i>
                        Parse Names
                    </button>
                </div>
                <small class="form-text text-muted">
                    Enter presenter names separated by commas. Names with "&" will be treated as a single presenter.
                </small>
            </div>
        `;

        // Initialize drag and drop after rendering presenter tags
        this.initializeDragAndDrop();
        
        // Initialize sensitivity slider
        this.initializeSensitivitySlider();
        
        // Set up parse presenters button event listener
        const parsePresentersBtn = document.getElementById('parsePresentersBtn');
        if (parsePresentersBtn) {
            parsePresentersBtn.addEventListener('click', () => {
                const presenterInput = document.getElementById('presenterInput');
                const presenterString = presenterInput.value.trim();
                if (presenterString) {
                    this.parsePresenterString(presenterString);
                }
            });
        }
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

        // Make trash can droppable for deleting tags
        const trashCan = document.querySelector('.fa-trash');
        if (trashCan) {
            // Remove existing event listeners to avoid duplicates
            trashCan.removeEventListener('dragover', trashCan._dragOverHandler);
            trashCan.removeEventListener('dragleave', trashCan._dragLeaveHandler);
            trashCan.removeEventListener('drop', trashCan._dropHandler);
            
            // Create new handlers
            trashCan._dragOverHandler = (e) => {
                e.preventDefault();
                trashCan.style.color = '#dc3545';
                trashCan.style.transform = 'scale(1.2)';
            };
            
            trashCan._dragLeaveHandler = (e) => {
                trashCan.style.color = '#dc3545';
                trashCan.style.transform = 'scale(1)';
            };
            
            trashCan._dropHandler = (e) => {
                e.preventDefault();
                trashCan.style.color = '#dc3545';
                trashCan.style.transform = 'scale(1)';
                const presenter = e.dataTransfer.getData('text/plain');
                if (presenter && presenter !== 'custom') {
                    console.log('Dropping presenter on trash can:', presenter);
                    this.deletePresenterTag(presenter);
                }
            };
            
            trashCan.addEventListener('dragover', trashCan._dragOverHandler);
            trashCan.addEventListener('dragleave', trashCan._dragLeaveHandler);
            trashCan.addEventListener('drop', trashCan._dropHandler);
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
                            ${file.filename.split('/').pop()}
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
        const isChecked = segment.selected === true; // Only true if explicitly set to true
        
        return `
            <div class="segment-item p-3 border-bottom" 
                 onclick="app.splitterUI.playSegment('${filename}', ${index})"
                 data-filename="${filename}" data-index="${index}">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center">
                            <input type="checkbox" class="form-check-input me-3" 
                                   ${isChecked ? 'checked' : ''}
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
                
                // Save state after adding tag
                this.saveState();
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
                
                // Save state after removing tag
                this.saveState();
            }
        }
    }

    // Centralized selection management
    setSelectedSegment(filename, index) {
        // Remove selection from all segments
        document.querySelectorAll('.segment-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to the specified segment
        const targetSegment = document.querySelector(`[data-filename="${filename}"][data-index="${index}"]`);
        if (targetSegment) {
            targetSegment.classList.add('selected');
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

        // Update visual selection using centralized function
        this.setSelectedSegment(filename, index);
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
        
        // Execute extraction directly
        this.executeExtraction(extractionPlan);
    }

    async executeExtraction(extractionPlan) {

        this.isExtracting = true;
        this.shouldStopExtraction = false;
        this.updateSplitButton();
        this.splitProgress.classList.add('show');
        
        // Reset progress bar
        this.splitProgressBar.style.width = '0%';
        this.splitStatus.textContent = 'Starting extraction...';
        
        // Generate bash script first
        await this.generateBashScript(extractionPlan);
        
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

    async generateBashScript(extractionPlan) {
        try {
            let scriptContent = `#!/bin/bash
# SoundSplitter Video Extraction Script
# Generated on ${new Date().toISOString()}
# This script contains ffmpeg commands to extract video segments

echo "Starting video extraction..."

`;

            // Add ffmpeg commands for each segment
            for (const item of extractionPlan) {
                const startTime = this.parseTime(item.startTime);
                const endTime = this.parseTime(item.endTime);
                const duration = endTime - startTime;
                
                scriptContent += `# Extract: ${item.filename} from ${item.startTime} to ${item.endTime} -> ${item.outputName}
ffmpeg -i "${item.filename}" -ss ${item.startTime} -t ${duration} -c copy "${item.outputName}"
echo "Extracted: ${item.outputName}"

`;
            }

            scriptContent += `echo "Video extraction completed!"
`;

            // Send the script to the server to save it
            const response = await fetch('/api/save-bash-script', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    script: scriptContent
                })
            });

            if (response.ok) {
                console.log('Bash script generated successfully');
            } else {
                console.error('Failed to save bash script');
            }
        } catch (error) {
            console.error('Error generating bash script:', error);
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
            
            // Process all selected segments (except the last one, which we'll handle separately)
            for (let segmentIndex = 0; segmentIndex < orderedSelectedSegments.length-1; segmentIndex++) {
                const currentSegmentInfo = orderedSelectedSegments[segmentIndex];
                const currentSegment = currentSegmentInfo.segment;
                
                let segmentStart, segmentEnd, duration;
                
                segmentStart = currentSegment.start_time;
                const nextSegmentInfo = orderedSelectedSegments[segmentIndex + 1];
                segmentEnd = nextSegmentInfo.segment.end_time;
                
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
            
            // Create final segment from last selected applause to end of video
            if (orderedSelectedSegments.length > 0) {
                const lastSegmentInfo = orderedSelectedSegments[orderedSelectedSegments.length - 1];
                const lastSegment = lastSegmentInfo.segment;
                
                const finalSegmentStart = lastSegment.start_time;
                const finalSegmentEnd = '99:59'; // Use a very long time to capture to end of video
                const finalStartSeconds = this.parseTime(finalSegmentStart);
                const finalDuration = this.formatDuration(9999 - finalStartSeconds); // Approximate duration
                
                console.log(`Final segment: ${finalSegmentStart} - ${finalSegmentEnd}, Tags:`, lastSegment.tags);
                
                // Generate filename based on tags from the last segment
                let finalOutputName;
                if (lastSegment.tags && lastSegment.tags.length > 0) {
                    const tag = lastSegment.tags[0];
                    const presenterName = tag.startsWith('Custom:') ? tag.replace('Custom:', '') : tag;
                    
                    // Check for filename collisions in the entire plan
                    let presenterCount = 1;
                    let proposedName = `${presenterName}-${presenterCount}.mov`;
                    
                    // Keep incrementing until we find a unique filename
                    while (plan.some(item => item.outputName === proposedName)) {
                        presenterCount++;
                        proposedName = `${presenterName}-${presenterCount}.mov`;
                    }
                    
                    finalOutputName = proposedName;
                    console.log(`Using tag "${tag}" for final segment -> ${finalOutputName}`);
                } else {
                    finalOutputName = `${file.filename.replace(/\.[^/.]+$/, "")}_segment_${String(lastSegmentInfo.index + 1).padStart(3, '0')}.mov`;
                    console.log(`No tags for final segment -> ${finalOutputName}`);
                }
                
                plan.push({
                    filename: file.filename,
                    startTime: finalSegmentStart,
                    endTime: finalSegmentEnd,
                    duration: finalDuration,
                    outputName: finalOutputName
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
            console.log(`Full path: ${result.outputFile}`);
            console.log(`Check the 'extracted/' directory for your video segments`);
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
        
        // Save state after setting toastmaster
        this.saveState();
    }

    getToastmaster() {
        return this.toastmaster;
    }

    // Add toastmaster to all segments
    addToastmasterToAllSegments() {
        if (!this.toastmaster) return;
        
        if (!this.analyzedFiles || !Array.isArray(this.analyzedFiles)) {
            console.warn('No analyzed files available for adding toastmaster');
            return;
        }
        
        this.analyzedFiles.forEach(file => {
            if (file && file.applause_segments && Array.isArray(file.applause_segments)) {
                file.applause_segments.forEach(segment => {
                    if (!segment.tags) {
                        segment.tags = [];
                    }
                    if (!segment.tags.includes(this.toastmaster)) {
                        segment.tags.push(this.toastmaster);
                    }
                });
            }
        });
        
        this.renderFileList();
        this.initializeDragAndDrop();
        
        // Save state after adding toastmaster to all segments
        this.saveState();
    }

    // Tag deletion methods
    deletePresenterTag(presenterName) {
        if (confirm(`Are you sure you want to delete the tag "${presenterName}"?`)) {
            // Remove from presenters list
            this.presenters = this.presenters.filter(p => p.presenter !== presenterName);
            
            // Remove this tag from all segments
            if (this.analyzedFiles) {
                this.analyzedFiles.forEach(file => {
                    if (file.applause_segments) {
                        file.applause_segments.forEach(segment => {
                            if (segment.tags) {
                                segment.tags = segment.tags.filter(tag => tag !== presenterName);
                            }
                        });
                    }
                });
            }
            
            // Clear default presenters for this presenter
            if (this.defaultPresenters) {
                Object.keys(this.defaultPresenters).forEach(filename => {
                    if (this.defaultPresenters[filename] === presenterName) {
                        delete this.defaultPresenters[filename];
                    }
                });
                localStorage.setItem('defaultPresenters', JSON.stringify(this.defaultPresenters));
            }
            
            // Clear toastmaster if it was this presenter
            if (this.toastmaster === presenterName) {
                this.toastmaster = null;
            }
            
            // Re-render everything
            this.renderPresenterTags();
            this.renderFileList();
            
            // Save state
            this.saveState();
            
            console.log(`Deleted presenter tag: ${presenterName}`);
        }
    }
    
    deleteAllTags() {
        if (confirm('Are you sure you want to delete all tags? This will remove all presenter tags and clear all segment assignments.')) {
            // Clear presenters list
            this.presenters = [];
            
            // Clear all tags from all segments
            if (this.analyzedFiles) {
                this.analyzedFiles.forEach(file => {
                    if (file.applause_segments) {
                        file.applause_segments.forEach(segment => {
                            segment.tags = [];
                        });
                    }
                });
            }
            
            // Clear default presenters
            this.defaultPresenters = {};
            localStorage.setItem('defaultPresenters', JSON.stringify(this.defaultPresenters));
            
            // Clear toastmaster
            this.toastmaster = null;
            
            // Re-render everything
            this.renderPresenterTags();
            this.renderFileList();
            
            // Save state
            this.saveState();
            
            console.log('Deleted all tags');
        }
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
            
            // Save state after creating custom tag
            this.saveState();
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
                    
                    // Save state after replacing tag
                    this.saveState();
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

        // Record the action for undo
        this.recordAction({
            type: 'add_segment',
            filename: filename,
            index: index + 1,
            segment: JSON.parse(JSON.stringify(newSegment)) // Deep copy
        });

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
        
        // Save state after adding segment
        this.saveState();
    }

    removeSegment(filename, index) {
        const file = this.analyzedFiles.find(f => f.filename === filename);
        if (!file || !file.applause_segments[index]) return;

        // Record the action for undo
        this.recordAction({
            type: 'remove_segment',
            filename: filename,
            index: index,
            segment: JSON.parse(JSON.stringify(file.applause_segments[index])) // Deep copy
        });

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
        
        // Save state after removing segment
        this.saveState();
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
        
        // Save state after time change
        this.saveState();
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
    
    // State persistence methods
    saveState() {
        // Create a list of current video files for comparison
        const currentVideoFiles = this.analyzedFiles ? this.analyzedFiles.map(file => file.filename).sort() : [];
        
        const state = {
            analyzedFiles: this.analyzedFiles,
            toastmaster: this.toastmaster,
            presenters: this.presenters || [],
            videoFiles: currentVideoFiles,
            timestamp: new Date().toISOString()
        };
        
        try {
            // Try localStorage first (larger capacity)
            const stateJson = JSON.stringify(state);
            console.log('Saving state to localStorage with key:', this.stateCookieName);
            console.log('State size:', stateJson.length, 'characters');
            localStorage.setItem(this.stateCookieName, stateJson);
            console.log('State saved to localStorage');
            
            // Verify it was saved
            const savedState = localStorage.getItem(this.stateCookieName);
            if (savedState) {
                console.log('Verified state saved successfully, length:', savedState.length);
            } else {
                console.error('Failed to verify state was saved!');
            }
        } catch (error) {
            console.error('Failed to save state to localStorage:', error);
            // Fallback to cookie if localStorage fails
            try {
                const stateJson = JSON.stringify(state);
                const cookieValue = `${this.stateCookieName}=${encodeURIComponent(stateJson)}; path=/; max-age=2592000`; // 30 days
                document.cookie = cookieValue;
                console.log('State saved to cookie (fallback)');
                console.log('Cookie size:', cookieValue.length, 'characters');
            } catch (cookieError) {
                console.error('Failed to save state to cookie:', cookieError);
            }
        }
    }
    
    loadState() {
        try {
            // Try localStorage first
            console.log('Checking localStorage for key:', this.stateCookieName);
            const stateJson = localStorage.getItem(this.stateCookieName);
            
            if (stateJson) {
                console.log('Found state in localStorage, length:', stateJson.length);
                const state = JSON.parse(stateJson);
                
                // Check if the state is recent (within last 7 days)
                const stateDate = new Date(state.timestamp);
                const now = new Date();
                const daysDiff = (now - stateDate) / (1000 * 60 * 60 * 24);
                
                if (daysDiff <= 7) {
                    // Check if current video files match saved video files
                    const currentVideoFiles = this.analyzedFiles ? this.analyzedFiles.map(file => file.filename).sort() : [];
                    const savedVideoFiles = state.videoFiles || [];
                    
                    console.log('Current video files:', currentVideoFiles);
                    console.log('Saved video files:', savedVideoFiles);
                    
                    // Compare arrays
                    const filesMatch = currentVideoFiles.length === savedVideoFiles.length && 
                                     currentVideoFiles.every((file, index) => file === savedVideoFiles[index]);
                    
                    if (filesMatch) {
                        // Files match, merge saved tags and presenters with current files
                        this.toastmaster = state.toastmaster || null;
                        this.presenters = state.presenters || [];
                        
                        // Merge tags from saved state into current files
                        if (state.analyzedFiles && state.analyzedFiles.length > 0) {
                            state.analyzedFiles.forEach((savedFile, savedFileIndex) => {
                                const currentFile = this.analyzedFiles.find(f => f.filename === savedFile.filename);
                                if (currentFile && savedFile.applause_segments) {
                                    savedFile.applause_segments.forEach((savedSegment, savedSegmentIndex) => {
                                        if (currentFile.applause_segments[savedSegmentIndex]) {
                                            // Merge tags, but only keep tags that are still in the presenters list
                                            if (savedSegment.tags && savedSegment.tags.length > 0) {
                                                if (!currentFile.applause_segments[savedSegmentIndex].tags) {
                                                    currentFile.applause_segments[savedSegmentIndex].tags = [];
                                                }
                                                // Filter out tags that are no longer in the presenters list
                                                const validTags = savedSegment.tags.filter(tag => 
                                                    this.presenters.some(p => p.presenter === tag)
                                                );
                                                currentFile.applause_segments[savedSegmentIndex].tags = validTags;
                                            }
                                        }
                                    });
                                }
                            });
                        }
                        
                        console.log('State loaded from localStorage (files match)');
                        
                        return true;
                    } else {
                        console.log('Video files have changed, clearing state');
                        this.clearState();
                        return false;
                    }
                } else {
                    console.log('State is too old, ignoring');
                    this.clearState();
                }
            } else {
                console.log('No state found in localStorage');
                console.log('Available localStorage keys:', Object.keys(localStorage));
                
                // Fallback to cookie (with same file checking logic)
                const cookies = document.cookie.split(';');
                const stateCookie = cookies.find(cookie => cookie.trim().startsWith(`${this.stateCookieName}=`));
                
                if (stateCookie) {
                    const cookieStateJson = decodeURIComponent(stateCookie.split('=')[1]);
                    const state = JSON.parse(cookieStateJson);
                    
                    // Check if the state is recent (within last 7 days)
                    const stateDate = new Date(state.timestamp);
                    const now = new Date();
                    const daysDiff = (now - stateDate) / (1000 * 60 * 60 * 24);
                    
                    if (daysDiff <= 7) {
                        // Check if current video files match saved video files
                        const currentVideoFiles = this.analyzedFiles ? this.analyzedFiles.map(file => file.filename).sort() : [];
                        const savedVideoFiles = state.videoFiles || [];
                        
                        console.log('Current video files:', currentVideoFiles);
                        console.log('Saved video files:', savedVideoFiles);
                        
                        // Compare arrays
                        const filesMatch = currentVideoFiles.length === savedVideoFiles.length && 
                                         currentVideoFiles.every((file, index) => file === savedVideoFiles[index]);
                        
                        if (filesMatch) {
                            // Files match, merge saved tags and presenters with current files
                            this.toastmaster = state.toastmaster || null;
                            this.presenters = state.presenters || [];
                            
                            // Merge tags from saved state into current files
                            if (state.analyzedFiles && state.analyzedFiles.length > 0) {
                                state.analyzedFiles.forEach((savedFile, savedFileIndex) => {
                                    const currentFile = this.analyzedFiles.find(f => f.filename === savedFile.filename);
                                    if (currentFile && savedFile.applause_segments) {
                                        savedFile.applause_segments.forEach((savedSegment, savedSegmentIndex) => {
                                            if (currentFile.applause_segments[savedSegmentIndex]) {
                                                // Merge tags, but only keep tags that are still in the presenters list
                                                if (savedSegment.tags && savedSegment.tags.length > 0) {
                                                    if (!currentFile.applause_segments[savedSegmentIndex].tags) {
                                                        currentFile.applause_segments[savedSegmentIndex].tags = [];
                                                    }
                                                    // Filter out tags that are no longer in the presenters list
                                                    const validTags = savedSegment.tags.filter(tag => 
                                                        this.presenters.some(p => p.presenter === tag)
                                                    );
                                                    currentFile.applause_segments[savedSegmentIndex].tags = validTags;
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                            
                            console.log('State loaded from cookie (fallback, files match)');
                            
                            return true;
                        } else {
                            console.log('Video files have changed, clearing state');
                            this.clearState();
                            return false;
                        }
                    } else {
                        console.log('State cookie is too old, ignoring');
                        this.clearState();
                    }
                } else {
                    console.log('No state cookie found');
                }
            }
        } catch (error) {
            console.error('Failed to load state:', error);
            this.clearState();
        }
        return false;
    }
    
    clearState() {
        // Clear localStorage
        localStorage.removeItem(this.stateCookieName);
        
        // Clear cookie
        document.cookie = `${this.stateCookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        
        console.log('State cleared from localStorage and cookie');
    }
    
    // Modified loadAnalyzedFiles to load files first, then check state
    async loadAnalyzedFiles() {
        // First, load files from server
        try {
            const response = await fetch('/api/analyzed-files');
            if (!response.ok) {
                throw new Error('Failed to load analyzed files');
            }
            
            const data = await response.json();
            this.analyzedFiles = Array.isArray(data) ? data : [];
            
            // Now that we have the files, try to load saved state
            const stateLoaded = this.loadState();
            
            if (stateLoaded) {
                // Use saved state (which now includes the files with tags)
                this.renderFileList();
                this.renderPresenterTags(); // Render presenter tags from saved state
                this.updateSplitButton();
            } else {
                // No saved state or files don't match, use fresh files
                this.renderFileList();
                this.updateSplitButton();
            }
        } catch (error) {
            console.error('Error loading analyzed files:', error);
            this.analyzedFiles = [];
            this.fileList.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    No analyzed files found. Please run the applause detector first.
                </div>
            `;
        }
    }
    
    // Undo system methods
    recordAction(action) {
        this.actionStack.push(action);
        
        // Keep only the last maxUndoActions
        if (this.actionStack.length > this.maxUndoActions) {
            this.actionStack.shift();
        }
    }
    
    undoLastAction() {
        if (this.actionStack.length === 0) {
            console.log('No actions to undo');
            return;
        }
        
        const lastAction = this.actionStack.pop();
        const file = this.analyzedFiles.find(f => f.filename === lastAction.filename);
        
        if (!file) {
            console.log('File not found for undo:', lastAction.filename);
            return;
        }
        
        switch (lastAction.type) {
            case 'add_segment':
                // Remove the segment that was added
                if (file.applause_segments[lastAction.index]) {
                    file.applause_segments.splice(lastAction.index, 1);
                    console.log('Undid add segment at index', lastAction.index);
                }
                break;
                
            case 'remove_segment':
                // Reinsert the segment that was removed
                file.applause_segments.splice(lastAction.index, 0, lastAction.segment);
                console.log('Undid remove segment at index', lastAction.index);
                break;
                
            default:
                console.log('Unknown action type:', lastAction.type);
                return;
        }
        
        // Re-render the file list
        this.renderFileList();
        this.updateSplitButton();
        
        // Scroll to the affected area
        requestAnimationFrame(() => {
            const segmentElement = document.querySelector(`[data-filename="${lastAction.filename}"][data-index="${lastAction.index}"]`);
            if (segmentElement) {
                segmentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
        });
        
        // Save state after undo action
        this.saveState();
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