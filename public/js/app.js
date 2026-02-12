let currentVideoTitle = '';
let selectedFormat = 'mp4';
let batchResults = [];
let availableResolutions = []; // Store fetched resolutions
let clientId = Date.now().toString(36) + Math.random().toString(36).substring(2);
let loopStatus = ''; // formatted as [1/N]

// Setup SSE
const evtSource = new EventSource(`/api/progress?clientId=${clientId}`);
evtSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
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
        setTimeout(() => {
            document.getElementById('progressContainer').classList.remove('show');
        }, 5000);
    } else if (data.type === 'error') {
        showStatus('Download failed.', 'error');
        document.getElementById('progressContainer').classList.remove('show');
    }
};

// Theme toggle
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// Toggle batch resolution based on format
function toggleBatchResolution() {
    const format = document.getElementById('batchFormat').value;
    const resolutionSelect = document.getElementById('batchResolution');
    
    if (format === 'audio') {
        resolutionSelect.disabled = true;
        resolutionSelect.innerHTML = '<option value="">Audio Only (Default)</option>';
    } else {
        resolutionSelect.disabled = false;
        resolutionSelect.innerHTML = `
            <option value="best">Best Quality</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
        `;
    }
}

// Load saved theme
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

// Tab switching
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
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

// Fetch single video info
async function fetchVideoInfo() {
    const url = document.getElementById('videoUrl').value.trim();
    const status = document.getElementById('status');
    const spinner = document.getElementById('spinner');
    const videoInfo = document.getElementById('videoInfo');
    const resolutionSelect = document.getElementById('resolution');
    
    if (!url) {
        showStatus('Please enter a YouTube URL first!', 'error');
        return;
    }

    spinner.classList.add('active');
    showStatus('Fetching video information...', 'info');
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

            // Store available resolutions for format switching
            availableResolutions = data.resolutions || [];

            // Populate resolution dropdown
            if (selectedFormat !== 'audio') {
                resolutionSelect.innerHTML = '<option value="">-- Select resolution --</option>';
                data.resolutions.forEach(res => {
                    const option = document.createElement('option');
                    option.value = res;
                    option.textContent = res === 'best' ? 'Best Quality' : res;
                    resolutionSelect.appendChild(option);
                });
                resolutionSelect.disabled = false;
                resolutionSelect.addEventListener('change', updateDownloadButton);
                // Enable/disable download button based on selection
                updateDownloadButton();
            } else {
                resolutionSelect.innerHTML = '<option value="">Audio Only</option>';
                resolutionSelect.disabled = true;
                // Enable download button for audio format
                document.getElementById('downloadBtn').disabled = false;
            }
            
            showStatus('✅ Video info loaded successfully!', 'success');
        } else {
            showStatus(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus('Failed to fetch video info. Check your internet connection.', 'error');
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
            
            showStatus(`✅ Loaded ${batchResults.length} videos successfully!`, 'success');
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
// Shared download function
async function processDownload(url, resolution, format, prefix = '') {
    const progressContainer = document.getElementById('progressContainer');
    
    progressContainer.classList.add('show');
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = `${prefix}Starting download...`;
    showStatus(`${prefix}Downloading... Please wait ⏳`, 'info');

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, resolution, format, clientId: clientId })
        });

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = format === 'audio' ? 'audio.mp3' : 'video.mp4';
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = decodeURIComponent(filenameMatch[1]);
                }
            }

            // Stream Reader Implementation for "Saving..." progress
            const reader = response.body.getReader();
            const contentLength = +response.headers.get('Content-Length');
            let receivedLength = 0;
            const chunks = [];

            while (true) {
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
            document.getElementById('progressText').textContent = `${prefix}Download complete! ✅`;
            showStatus(`${prefix}✅ Download complete!`, 'success');
            
            // Save to history
            // We need title, so let's try to get it from current state or args
            // For batch/playlist, we might need to pass title. For single, use currentVideoTitle
            const title = (prefix ? 'Batch Item' : currentVideoTitle) || filename;
            saveToHistory({
                title: title,
                url: url,
                format: format,
                resolution: resolution
            });
            
            return true;
        } else {
            const data = await response.json();
            showStatus(`Error: ${data.error}`, 'error');
            return false;
        }
    } catch (error) {
        showStatus('Failed to download video.', 'error');
        console.error(error);
        return false;
    }
}

// Start single download
async function startDownload() {
    const url = document.getElementById('videoUrl').value.trim();
    const resolution = document.getElementById('resolution').value;
    const spinner = document.getElementById('spinner');
    
    if (!url) {
        showStatus('Please enter a YouTube URL first!', 'error');
        return;
    }

    spinner.classList.add('active');
    document.getElementById('downloadBtn').disabled = true;

    try {
        await processDownload(url, resolution, selectedFormat);
    } finally {
        loopStatus = '';
        spinner.classList.remove('active');
        document.getElementById('downloadBtn').disabled = false;
        setTimeout(() => {
            document.getElementById('progressContainer').classList.remove('show');
        }, 3000);
    }
}

// Playlist Logic
let statusTimeout;
let playlistStatusTimeout;

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
    startBatchDownload();
}

// Start batch download
async function startBatchDownload() {
    const resolution = document.getElementById('batchResolution').value;
    const format = document.getElementById('batchFormat').value;
    const btn = document.getElementById('batchDownloadBtn');
    const spinner = document.getElementById('spinner');

    if (batchResults.length === 0) {
        showStatus('No videos to download!', 'error');
        return;
    }

    btn.disabled = true;
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
    showStatus(`Batch download finished: ${successCount} files downloaded.`, 'success');
    setTimeout(() => {
        document.getElementById('progressContainer').classList.remove('show');
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

