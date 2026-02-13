let currentVideoTitle = '';
let selectedFormat = 'mp4';
let batchResults = [];
let availableResolutions = []; // Store fetched resolutions
// Consistent Client ID for this session
const clientId = Date.now().toString(36) + Math.random().toString(36).substring(2);
let loopStatus = ''; // formatted as [1/N]
let isDownloadCancelled = false;



// Setup SSE
const evtSource = new EventSource(`/api/progress?clientId=${clientId}`);
evtSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    // STRICT BLOCK: granular ignore if download is cancelled
    if (isDownloadCancelled && data.type !== 'complete') {
        console.log('Ignored SSE event due to cancellation:', data.type);
        return;
    }

    if (data.type === 'progress') {
        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        progressContainer.classList.add('show');
        progressFill.style.width = `${data.percent}%`;
        progressText.textContent = `${loopStatus} ${data.percent}% - ${data.text}`;
    } else if (data.type === 'complete') {
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('progressText').textContent = 'Download complete! ✅';
        
        // Only auto-hide if NOT in batch mode
        if (!isBatchRunning) {
            setTimeout(() => {
                const pContainer = document.getElementById('progressContainer');
                if (pContainer) pContainer.classList.remove('show');
            }, 5000);
        }
    } else if (data.type === 'error') {
        if (isDownloadCancelled) return; // Ignore server errors if cancelled
        showToast('Download failed.', 'error'); // Use showToast
        if (!isBatchRunning) {
            document.getElementById('progressContainer').classList.remove('show');
        }
    }
};

// State flag for batch mode
let isBatchRunning = false;

// Theme toggle
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// Toggle batch resolution based on format
function toggleBatchResolution() {
    const formatInput = document.querySelector('input[name="batchFormat"]:checked');
    const format = formatInput ? formatInput.value : 'mp4';
    const resolutionSelect = document.getElementById('batchResolution');
    
    if (format === 'audio') {
        resolutionSelect.disabled = true;
        resolutionSelect.innerHTML = '<option value="">Audio Only (Default)</option>';
    } else {
        resolutionSelect.disabled = false;
        resolutionSelect.innerHTML = `
            <option value="" disabled selected>Select Resolution</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
        `;
    }
}

// Batch Format Selection
function selectBatchFormat(format, element) {
    // Update UI
    document.querySelectorAll('#batchOptions .format-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    
    // Update Radio
    const radio = element.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    
    toggleBatchResolution();
}

// Load saved theme
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

// Tab switching
// Tab switching
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('single-tab').style.display = tab === 'single' ? 'block' : 'none';
    document.getElementById('batch-tab').style.display = tab === 'batch' ? 'block' : 'none';
    document.getElementById('playlist-tab').style.display = tab === 'playlist' ? 'block' : 'none';
}

// Format selection
function selectFormat(format, element) {
    selectedFormat = format;
    document.querySelectorAll('.format-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    
    // Update resolution dropdown based on format
    const resolutionSelect = document.getElementById('resolution');
    const downloadBtn = document.getElementById('downloadBtn');
    
    if (format === 'audio') {
        resolutionSelect.disabled = true;
        resolutionSelect.innerHTML = '<option value="">Audio Only (MP3)</option>';
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '⬇️ Download MP3';
    } else {
        // Restore available resolutions if we have them
        resolutionSelect.disabled = false;
        if (availableResolutions.length > 0) {
            resolutionSelect.innerHTML = '<option value="">-- Select resolution --</option>';
            availableResolutions.forEach(res => {
                const option = document.createElement('option');
                option.value = res;
                option.textContent = res === 'best' ? 'Best Quality' : res;
                resolutionSelect.appendChild(option);
            });
            // Enable download button if resolution is selected
            downloadBtn.disabled = !resolutionSelect.value;
        } else {
            resolutionSelect.innerHTML = '<option value="">-- Select resolution after fetching info --</option>';
            downloadBtn.disabled = true;
        }
        downloadBtn.innerHTML = '⬇️ Download Video';
    }
}

async function toggleHistory() {
    console.log('Toggle history clicked');
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.classList.toggle('show');
        console.log('Modal class list:', modal.classList);
    } else {
        console.error('History modal not found!');
    }
}

// Close history when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('historyModal');
    const toggleBtn = document.querySelector('.history-toggle');
    
    if (modal && toggleBtn && 
        modal.classList.contains('show') && 
        !modal.contains(e.target) && 
        !toggleBtn.contains(e.target)) {
        modal.classList.remove('show');
    }
});

// History Logic
function saveToHistory(item) {
    let history = JSON.parse(localStorage.getItem('downloadHistory') || '[]');
    const newItem = {
        ...item,
        id: Date.now(),
        date: new Date().toISOString()
    };
    
    // Add to beginning
    history.unshift(newItem);
    
    // Limit to 20 items
    if (history.length > 20) {
        history = history.slice(0, 20);
    }
    
    localStorage.setItem('downloadHistory', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    const history = JSON.parse(localStorage.getItem('downloadHistory') || '[]');
    
    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-text">No downloads yet.</p>';
        return;
    }
    
    historyList.innerHTML = history.map(item => `
        <div class="history-item">
            <div class="history-info">
                <div class="history-title" title="${item.title}">${item.title}</div>
                <div class="history-meta">
                    <span class="history-badge">${item.format}</span>
                    ${item.resolution ? `<span class="history-badge">${item.resolution}</span>` : ''}
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                </div>
            </div>
            <button class="btn-icon" onclick="redownloadItem('${item.url}')" title="Redownload">
                🔄
            </button>
        </div>
    `).join('');
}

function clearHistory() {
    if (confirm('Are you sure you want to clear your download history?')) {
        localStorage.removeItem('downloadHistory');
        renderHistory();
    }
}

function redownloadItem(url) {
    document.getElementById('videoUrl').value = url;
    // Close modal
    document.getElementById('historyModal').classList.remove('show');
    // Switch to single tab
    switchTab('single');
    // Trigger fetch info
    fetchVideoInfo();
}

// Initialize history on load
document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
});

// Status Timeouts
let statusTimeout;
let playlistStatusTimeout;
let singleStatusTimeout;

// ...

// Helper for Single Status
function showSingleStatus(message, type, persistent = false) {
    const statusEl = document.getElementById('singleStatus');
    if (!statusEl) return;
    
    if (singleStatusTimeout) {
        clearTimeout(singleStatusTimeout);
        singleStatusTimeout = null;
    }
    
    statusEl.textContent = message;
    statusEl.className = type;
    statusEl.classList.add('show');
    statusEl.style.display = 'block';
    
    if (type !== 'error' && !persistent) {
        singleStatusTimeout = setTimeout(() => {
            statusEl.classList.remove('show');
            statusEl.style.display = 'none';
        }, 5000);
    }
}

// Playlist Logic
// ... (fetchPlaylistInfo remains same-ish, but let's leave it alone if not in view)
// I will only replace the top part and fetchVideoInfo

// Fetch single video info
async function fetchVideoInfo() {
    const url = document.getElementById('videoUrl').value.trim();
    const videoInfo = document.getElementById('videoInfo');
    const resolutionSelect = document.getElementById('resolution');
    const spinner = document.getElementById('spinner');
    
    if (!url) {
        showSingleStatus('Please enter a YouTube URL first!', 'error');
        return;
    }

    if (url.includes('playlist?list=') && !url.includes('watch?v=') && !url.includes('youtu.be/')) {
        showSingleStatus('This looks like a playlist. Please use the "Playlist" tab!', 'error');
        return;
    }

    spinner.classList.add('active');
    showSingleStatus('Fetching video information...', 'info', true);
    resolutionSelect.disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    videoInfo.classList.remove('show');

    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        
        if (data.success) {
            currentVideoTitle = data.title;
            
            document.getElementById('videoTitle').textContent = data.title;
            const duration = formatDuration(data.duration);
            document.getElementById('videoDuration').textContent = duration ? `Duration: ${duration}` : '';
            
            const thumbnailImg = document.getElementById('videoThumbnail');
            if (data.thumbnail) {
                thumbnailImg.src = data.thumbnail;
                thumbnailImg.style.display = 'block';
            } else {
                thumbnailImg.style.display = 'none';
            }
            
            videoInfo.classList.add('show');

            availableResolutions = data.resolutions || [];

            if (selectedFormat !== 'audio') {
                resolutionSelect.innerHTML = '<option value="">-- Select resolution --</option>';
                data.resolutions.forEach(res => {
                    const option = document.createElement('option');
                    option.value = res;
                    option.textContent = res === 'best' ? 'Best Quality' : res;
                    resolutionSelect.appendChild(option);
                });
                resolutionSelect.disabled = false;
                resolutionSelect.removeEventListener('change', updateDownloadButton);
                resolutionSelect.addEventListener('change', updateDownloadButton);
                updateDownloadButton();
            } else {
                resolutionSelect.innerHTML = '<option value="">Audio Only</option>';
                resolutionSelect.disabled = true;
                document.getElementById('downloadBtn').disabled = false;
            }
            
            showSingleStatus('✅ Video info loaded successfully!', 'success');
        } else {
            showSingleStatus(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showSingleStatus('Failed to fetch video info. Check your internet connection.', 'error');
        console.error(error);
    } finally {
        spinner.classList.remove('active');
    }
}

// Fetch batch video info
async function fetchBatchInfo() {
    const urls = document.getElementById('batchUrls').value.trim();
    const status = document.getElementById('status');
    const spinner = document.getElementById('spinner');
    
    if (!urls) {
        showStatus('Please enter at least one YouTube URL!', 'error');
        return;
    }

    const urlList = urls.split('\n').filter(u => u.trim());
    if (urlList.length === 0) {
        showStatus('No valid URLs found!', 'error');
        return;
    }

    spinner.classList.add('active');
    showStatus(`Fetching info for ${urlList.length} videos...`, 'info');

    try {
        const response = await fetch('/api/batch-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls: urlList,
                resolution: document.getElementById('batchResolution').value,
                format: document.getElementById('batchFormat').value
            })
        });

        const data = await response.json();
        
        if (data.success) {
            batchResults = data.results;
            
            const resultsDiv = document.getElementById('batchResults');
            resultsDiv.style.display = 'block';
            
            let html = `<h4 style="margin-bottom: 10px;">📊 Preview Results (${data.summary.successful}/${data.summary.total} valid)</h4>`;
            
            if (data.errors.length > 0) {
                html += `<p style="color: var(--danger); margin-bottom: 10px;">❌ ${data.errors.length} URLs failed</p>`;
            }
            
            batchResults.forEach((result, index) => {
                if (result.success) {
                    html += `<div style="padding: 8px; margin: 5px 0; background: rgba(72, 187, 120, 0.1); border-radius: 5px;">
                        ✅ ${result.title || 'Unknown Video'}
                    </div>`;
                }
            });

            resultsDiv.innerHTML = html;
            document.getElementById('batchDownloadBtn').disabled = batchResults.length === 0;
            
            showStatus(`Loaded ${batchResults.length} videos successfully!`, 'success');
        } else {
            showStatus(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus('Failed to fetch batch info.', 'error');
        console.error(error);
    } finally {
        spinner.classList.remove('active');
    }
}

function updateDownloadButton() {
    const resolutionSelect = document.getElementById('resolution');
    const downloadBtn = document.getElementById('downloadBtn');
    
    if (selectedFormat === 'audio') {
        downloadBtn.disabled = false;
    } else {
        downloadBtn.disabled = !resolutionSelect.value;
    }
}

// Start single download
// Status Timeouts
// Status Timeouts (Moved to top)

// ... (other code)

// Helper for Single Status
// Helper for Single Status
// Toast Notification System
function showToast(message, type = 'info', duration = 5000, replaceId = null) {
    if (!message) return;

    const container = document.getElementById('toast-container');
    if (!container) return;

    // Check for existing toast with same ID and remove it
    if (replaceId) {
        const existingToast = document.getElementById(replaceId);
        if (existingToast) {
            existingToast.remove();
        }
    }

    // Icon mapping
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    if (replaceId) toast.id = replaceId;
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || ''}</div>
        <div class="toast-content">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">✖</button>
    `;

    // Append to container (Newest at bottom)
    container.appendChild(toast);

    // Auto dismiss
    if (duration) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('hiding');
                toast.addEventListener('animationend', () => toast.remove());
            }
        }, duration);
    }
}

// Legacy wrappers for backward compatibility (redirect to Toast with ID to mimic single-slot behavior)
function showStatus(message, type, persistent = false) {
    // Use fixed ID to replace previous global status (e.g. "Downloading..." -> "Complete")
    showToast(message, type, persistent ? 0 : 5000, 'toast-global-status');
}

function showSingleStatus(message, type, persistent = false) {
    // Use fixed ID to replace previous single status (e.g. "Fetching..." -> "Loaded")
    // UNIFIED: Use 'toast-global-status' so it shares the slot with cancel/batch statuses
    showToast(message, type, persistent ? 0 : 5000, 'toast-global-status');
}

// ...

// Fetch single video info
async function fetchVideoInfo() {
    const url = document.getElementById('videoUrl').value.trim();
    const spinner = document.getElementById('spinner');
    const videoInfo = document.getElementById('videoInfo');
    const resolutionSelect = document.getElementById('resolution');
    
    if (!url) {
        showSingleStatus('Please enter a YouTube URL first!', 'error');
        return;
    }

    // Validation ...
    if (url.includes('playlist?list=') && !url.includes('watch?v=') && !url.includes('youtu.be/')) {
        showSingleStatus('This looks like a playlist. Please use the "Playlist" tab!', 'error');
        return;
    }

    spinner.classList.add('active');
    showSingleStatus('Fetching video information...', 'info', true);
    resolutionSelect.disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    videoInfo.classList.remove('show');

    try {
        // ... (fetch)
        const response = await fetch('/api/video-info', {
             // ...
             method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        
        if (data.success) {
            // ... (populate info)
            currentVideoTitle = data.title;
            
            document.getElementById('videoTitle').textContent = data.title;
            const duration = formatDuration(data.duration);
            document.getElementById('videoDuration').textContent = duration ? `Duration: ${duration}` : '';
            
            const thumbnailImg = document.getElementById('videoThumbnail');
            if (data.thumbnail) {
                thumbnailImg.src = data.thumbnail;
                thumbnailImg.style.display = 'block';
            } else {
                thumbnailImg.style.display = 'none';
            }
            
            videoInfo.classList.add('show');
            availableResolutions = data.resolutions || [];

             if (selectedFormat !== 'audio') {
                resolutionSelect.innerHTML = '<option value="">-- Select resolution --</option>';
                data.resolutions.forEach(res => {
                    const option = document.createElement('option');
                    option.value = res;
                    option.textContent = res === 'best' ? 'Best Quality' : res;
                    resolutionSelect.appendChild(option);
                });
                resolutionSelect.disabled = false;
                resolutionSelect.removeEventListener('change', updateDownloadButton); // Cleanup
                resolutionSelect.addEventListener('change', updateDownloadButton);
                updateDownloadButton();
            } else {
                resolutionSelect.innerHTML = '<option value="">Audio Only</option>';
                resolutionSelect.disabled = true;
                document.getElementById('downloadBtn').disabled = false;
            }
            
            showSingleStatus('Video info loaded successfully!', 'success');
        } else {
            showSingleStatus(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showSingleStatus('Failed to fetch video info. Check your internet connection.', 'error');
        console.error(error);
    } finally {
        spinner.classList.remove('active');
    }
}

// ...

// Shared download function
async function processDownload(url, resolution, format, prefix = '', statusFn = showStatus) {
    console.log('processDownload started', { url, prefix });
    isDownloadCancelled = false;
    const progressContainer = document.getElementById('progressContainer');
    
    if (progressContainer) {
        console.log('progressContainer found, showing it');
        progressContainer.classList.add('show');
    } else {
        console.error('progressContainer NOT FOUND');
    }

    // cancelBtn removal - handled by updateDownloadButtonState in startDownload
    
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = `${prefix}Starting download...`;
    
    statusFn(`${prefix}Downloading... Please wait`, 'info', true);
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, resolution, format, clientId: clientId })
        });

        if (response.ok) {
            // ... (filename logic)
              const contentDisposition = response.headers.get('Content-Disposition');
            let filename = format === 'audio' ? 'audio.mp3' : 'video.mp4';
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = decodeURIComponent(filenameMatch[1]);
                }
            }

            // Stream Reader
            const reader = response.body.getReader();
            const contentLength = +response.headers.get('Content-Length');
            let receivedLength = 0;
            const chunks = [];

            while (true) {
                if (isDownloadCancelled) {
                    await reader.cancel();
                    console.log('Download stream cancelled by user');
                    return false;
                }

                const { done, value } = await reader.read();
                if (done) break;
                
                chunks.push(value);
                receivedLength += value.length;
                
                if (contentLength) {
                    const percent = Math.round((receivedLength / contentLength) * 100);
                    document.getElementById('progressFill').style.width = `${percent}%`;
                    document.getElementById('progressText').textContent = `${prefix}Saving to device... ${percent}%`;
                }
            }

            const blob = new Blob(chunks);
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            document.getElementById('progressFill').style.width = '100%';
            document.getElementById('progressText').textContent = `${prefix}Download complete!`;
            statusFn(`${prefix}Download complete!`, 'success');
            
            // Save to history
            const title = (prefix ? 'Batch Item' : currentVideoTitle) || filename;
            saveToHistory({
                title: title,
                url: url,
                format: format,
                resolution: resolution
            });
            
            return true;
        } else {
            // If cancelled, suppress server errors
            if (isDownloadCancelled) return false;

            const data = await response.json();
            statusFn(`Error: ${data.error}`, 'error');
            return false;
        }
    } catch (error) {
        if (isDownloadCancelled) {
             console.log('Download error suppressed due to cancellation');
             return false;
        }
        statusFn('Failed to download video.', 'error');
        console.error(error);
        return false;
    } finally {
        // No visual cleanup needed here, startDownload finally block handles it
    }
}

let isSingleDownloadRunning = false;

// Unified Button Handler
function handleDownloadAction(btn) {
    if (isSingleDownloadRunning) {
        cancelDownload();
    } else {
        startDownload();
    }
}

// Helper to toggle button state
function updateDownloadButtonState(state) {
    const btn = document.getElementById('downloadBtn');
    if (!btn) return;

    if (state === 'downloading') {
        isSingleDownloadRunning = true;
        btn.textContent = '🛑 Cancel Download';
        btn.className = 'btn-danger'; // Switch to red
        btn.disabled = false; // Ensure it's clickable
    } else {
        isSingleDownloadRunning = false;
        btn.textContent = '⬇️ Download Video';
        btn.className = 'btn-success'; // Revert to green
        btn.disabled = false;
    }
}

async function cancelDownload() {
    isDownloadCancelled = true;
    const btn = document.getElementById('downloadBtn');
    
    // Visual feedback immediately
    btn.textContent = 'Cancelling...';
    btn.disabled = true;
    
    // FORCE REMOVE ANY EXISTING STATUS TOAST
    const existing = document.getElementById('toast-global-status');
    if (existing) existing.remove();
    
    showToast('Download cancelled.', 'error', 5000, 'toast-global-status');

    try {
        await fetch('/api/cancel-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId })
        });
        
        document.getElementById('progressContainer').classList.remove('show');
    } catch (error) {
        console.error('Cancel failed:', error);
        showToast('Failed to cancel. Server might be busy.', 'error'); // Use showToast, not showStatus
    } finally {
        // Reset UI via helper
        updateDownloadButtonState('idle');
        document.getElementById('spinner').classList.remove('active');
    }
}

// Start single download
async function startDownload() {
    const urlInput = document.getElementById('videoUrl');
    const resInput = document.getElementById('resolution');
    const spinner = document.getElementById('spinner');
    
    // Robust element fetching
    const url = urlInput ? urlInput.value.trim() : '';
    const resolution = resInput ? resInput.value : '';

    if (!url) return showToast('Please enter a YouTube URL', 'error');
    if (!resolution && selectedFormat !== 'audio') return showToast('Please select a resolution', 'error');

    // UI Updates START
    updateDownloadButtonState('downloading');
    spinner.classList.add('active');
    document.getElementById('progressContainer').classList.remove('show');
    
    isDownloadCancelled = false; // Reset flag

    try {
        await processDownload(url, resolution, selectedFormat, '', (msg, type) => showSingleStatus(msg, type));
    } catch (error) {
        console.error(error);
        showSingleStatus('Download failed', 'error');
    } finally {
        // Only revert to IDLE if we aren't stuck in "Cancelling" limbo
        // But cancelDownload handles its own reset.
        if (!isDownloadCancelled) {
             updateDownloadButtonState('idle');
             spinner.classList.remove('active');
        }
    }
}

// Playlist Logic
// Playlist Logic

async function fetchPlaylistInfo() {
    const url = document.getElementById('playlistUrl').value.trim();
    if (!url) return showPlaylistStatus('Please enter a standard Playlist URL', 'error');

    const spinner = document.getElementById('playlistSpinner');
    const fetchBtn = document.querySelector('#playlist-tab .btn-primary');

    // persistent = true for loading state
    showPlaylistStatus('Fetching playlist info... (This may take a moment)', 'info', true);
    spinner.classList.add('active');
    if (fetchBtn) fetchBtn.disabled = true;
    
    try {
        const response = await fetch('/api/playlist-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        // Artificial delay for smoother UX
        await new Promise(r => setTimeout(r, 600));
        
        if (data.success) {
            document.getElementById('playlistInfo').classList.remove('hidden');
            document.getElementById('playlistTitle').textContent = data.title;
            document.getElementById('playlistCount').textContent = `${data.itemCount} Videos found`;
            
            const list = document.getElementById('playlistItems');
            list.innerHTML = '';
            
            data.entries.forEach((video, index) => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.innerHTML = `
                    <div class="file-info">
                        <strong>${index + 1}. ${video.title}</strong>
                        <span class="file-size">${video.duration ? formatDuration(video.duration) : ''}</span>
                    </div>
                `;
                item.dataset.url = video.url;
                list.appendChild(item);
            });
            
            showPlaylistStatus('✅ Playlist info fetched!', 'success');
        } else {
            showPlaylistStatus(data.error || 'Failed to fetch playlist', 'error');
        }
    } catch (error) {
        showPlaylistStatus('Error fetching playlist info', 'error');
        console.error(error);
    } finally {
        spinner.classList.remove('active');
        if (fetchBtn) fetchBtn.disabled = false;
    }
}

function showPlaylistStatus(message, type, persistent = false) {
    const statusEl = document.getElementById('playlistStatus');
    if (!statusEl) return;
    
    // Clear existing timeout to prevent premature hiding
    if (playlistStatusTimeout) {
        clearTimeout(playlistStatusTimeout);
        playlistStatusTimeout = null;
    }
    
    statusEl.textContent = message;
    statusEl.className = type;
    statusEl.classList.add('show');
    
    // Auto hide only if not error and not persistent
    if (type !== 'error' && !persistent) {
        playlistStatusTimeout = setTimeout(() => {
            statusEl.classList.remove('show');
        }, 5000); // 5 seconds display for success messages
    }
}

function showStatus(message, type, persistent = false) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    // Clear existing timeout
    if (statusTimeout) {
        clearTimeout(statusTimeout);
        statusTimeout = null;
    }
    
    statusEl.textContent = message;
    statusEl.className = type;
    statusEl.classList.add('show');
    statusEl.style.display = 'block'; // Ensure display block for generic status
    
    if (type !== 'error' && !persistent) {
        statusTimeout = setTimeout(() => {
            statusEl.classList.remove('show');
            statusEl.style.display = 'none';
        }, 5000);
    }
}

function downloadPlaylist() {
    const format = document.getElementById('playlistFormat').value;
    const items = document.querySelectorAll('#playlistItems .file-item');
    const urls = Array.from(items).map(item => item.dataset.url);
    
    if (urls.length === 0) return showStatus('No videos in playlist to download', 'error');
    
    // Reuse existing batch logic via UI manipulation or direct call?
    // Let's call the internal logic of startBatchDownload but with custom args
    
    // Switch to batch tab visually to show progress
    document.querySelector('[data-tab="batch"]').click();
    
    // Populate batch inputs
    document.getElementById('batchUrls').value = urls.join('\n');
    document.getElementById('batchFormat').value = format;
    
    // Trigger batch download
    // fetchBatchInfo() is needed first to populate batchResults!
    fetchBatchInfo(); 
}

// Batch Logic

async function fetchBatchInfo() {
    console.log('fetchBatchInfo called');
    const urls = document.getElementById('batchUrls').value
        .split('\n')
        .map(u => u.trim())
        .filter(u => u);

    if (urls.length === 0) return showStatus('Please enter at least one URL', 'error');

    const listContainer = document.getElementById('batchList');
    const downloadBtn = document.getElementById('batchDownloadBtn');
    const batchOptions = document.getElementById('batchOptions');
    const listHeader = document.getElementById('batchListHeader');
    const spinner = document.getElementById('spinner'); // Reuse main spinner
    
    batchResults = [];
    listContainer.innerHTML = '';
    downloadBtn.disabled = true;
    if (batchOptions) batchOptions.style.display = 'none'; // Hide options before fetch
    if (listHeader) listHeader.style.display = 'none'; // Hide header before fetch
    spinner.classList.add('active');
    
    showToast(`Fetching info for ${urls.length} videos...`, 'info', 10000, 'batch-fetch-toast');

    let processedCount = 0;

    // Process sequentially to be safe, or parallel with limit?
    // Sequential for now to avoid rate limits
    for (const url of urls) {
        processedCount++;
        // Update toast message
        showToast(`Fetching info: ${processedCount}/${urls.length}`, 'info', 10000, 'batch-fetch-toast');
        
        try {
            const response = await fetch('/api/video-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await response.json();
            
            if (response.ok) {
                batchResults.push({
                    url: url,
                    title: data.title,
                    duration: data.duration,
                    thumbnail: data.thumbnail,
                    success: true
                });
                
                // Add to UI immediately
                const div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML = `
                    <div class="file-info">
                        <strong>${data.title}</strong>
                        <span class="file-meta">${formatDuration(data.duration)}</span>
                    </div>
                    <span class="status-icon success">✅</span>
                `;
                listContainer.appendChild(div);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error(error);
             batchResults.push({
                url: url,
                success: false,
                error: error.message
            });
            
            const div = document.createElement('div');
            div.className = 'file-item error';
            div.innerHTML = `
                <div class="file-info">
                    <strong>Error fetching info</strong>
                    <div class="file-url">${url}</div>
                </div>
                <span class="status-icon error">❌</span>
            `;
            listContainer.appendChild(div);
        }
    }
    
    spinner.classList.remove('active');
    
    // Clear the progress toast
    const progressToast = document.getElementById('batch-fetch-toast');
    if (progressToast) progressToast.remove();
    
    const successCount = batchResults.filter(r => r.success).length;
    if (successCount > 0) {
        downloadBtn.disabled = false;
        if (batchOptions) batchOptions.style.display = 'block'; // Show options after fetch
        if (listHeader) listHeader.style.display = 'block'; // Show header after fetch
        showToast(`Found ${successCount} valid videos. Ready to download.`, 'success');
    } else {
         showToast('No valid videos found.', 'error');
    }
}

// Start batch download
async function startBatchDownload() {
    const btn = document.getElementById('batchDownloadBtn');
    const spinner = document.getElementById('spinner');

    if (batchResults.length === 0) {
        showToast('No videos to download!', 'error');
        return;
    }
    
    // Get resolution from dropdown
    const resolution = document.getElementById('batchResolution').value;
    
    // Get format from radio buttons
    const formatInput = document.querySelector('input[name="batchFormat"]:checked');
    const format = formatInput ? formatInput.value : 'mp4';
    
    // Strict validation: Must select a resolution if not Audio
    if (!resolution && format !== 'audio') {
        return showToast('Please select a resolution', 'error');
    }

    btn.disabled = true;
    isBatchRunning = true; // Set flag
    spinner.classList.add('active');
    let successCount = 0;

    for (let i = 0; i < batchResults.length; i++) {
        const item = batchResults[i];
        if (item.success) {
            loopStatus = `[${i + 1}/${batchResults.length}]`;
            showStatus(`${loopStatus} Downloading: ${item.title}...`, 'info');
            
            // Pass the formatted prefix to processDownload
            // We temporarily modify processDownload signature to accept title, OR we handle history inside startBatchDownload
            // Better: update processDownload to accept an options object or title argument
            // For now, let's just hack it: we save history here for batch items
            const result = await processDownload(item.url, resolution, format, `${loopStatus} `);
            if (result) {
                successCount++;
                saveToHistory({
                    title: item.title,
                    url: item.url,
                    format: format,
                    resolution: resolution
                });
            }
            
            // Wait a bit between downloads to let browser handle the file
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    loopStatus = ''; // Reset
    spinner.classList.remove('active');
    btn.disabled = false;
    isBatchRunning = false; // Reset flag
    showToast(`Batch download finished: ${successCount} files downloaded.`, 'success');
    setTimeout(() => {
        const pContainer = document.getElementById('progressContainer');
        if (pContainer) pContainer.classList.remove('show');
    }, 5000);
}

// Helper Functions - showStatus is now defined above with timeout handling

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

