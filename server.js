require('dotenv').config();
const express = require('express');
const ytDlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const logger = require('./logger');
const loggingMiddleware = require('./middleware/logging');
const authMiddleware = require('./middleware/auth');
const { apiRateLimiter, downloadRateLimiter, adminRateLimiter } = require('./middleware/rate-limit');
const { validate, videoInfoSchema, downloadSchema, batchDownloadSchema, extractVideoId } = require('./middleware/validation');
const { downloadQueue } = require('./middleware/download-queue');
const https = require('https');
const http = require('http');
const pLimit = require('p-limit'); // For batch concurrency

const app = express();

// Middleware
app.use(express.json());
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        if (req.path.includes('/api/progress')) {
            return false;
        }
        return compression.filter(req, res);
    }
})); // Enable gzip compression, exclude SSE
app.use(express.static('public'));

// Apply logging middleware to all routes
app.use(loggingMiddleware);

// =====================
// Rate Limiting
// =====================
// Apply general API rate limiter to all routes
app.use('/api', apiRateLimiter);

// =====================
// SSE (Server-Sent Events) Setup
// =====================
let clients = [];

function sendProgress(clientId, data) {
    const client = clients.find(c => c.id === clientId);
    if (client) {
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
        // Force flush if method exists (useful for some environments)
        if (typeof client.res.flush === 'function') {
            client.res.flush();
        }
    }
}

app.get('/api/progress', (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering if present
    };
    res.writeHead(200, headers);
    
    // Disable Nagle's algorithm
    req.socket.setNoDelay(true);
    
    const clientId = req.query.clientId;
    console.log(`[SSE] Client connected: ${clientId}`);

    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);

    // Send initial keep-alive/ping
    res.write(':\n\n'); 

    // Remove client on close
    req.on('close', () => {
        console.log(`[SSE] Client disconnected: ${clientId}`);
        clients = clients.filter(c => c.id !== clientId);
    });
});



// =====================
// Health Check Endpoint
// =====================
app.get('/health', (req, res) => {
    const queueStatus = downloadQueue.getStatus();
    const diskUsage = getDiskUsage();
    
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        queue: queueStatus,
        disk: diskUsage
    });
});

// =====================
// Queue Status Endpoint
// =====================
app.get('/api/queue/status', (req, res) => {
    const status = downloadQueue.getStatus();
    res.json({
        success: true,
        ...status
    });
});

// =====================
// Video Info Endpoint
// =====================
app.post('/api/video-info', 
    apiRateLimiter, 
    validate(videoInfoSchema),
    async (req, res) => {
        const { url } = req.validatedBody;
        const startTime = Date.now();

        try {
            // Extract video ID or use original URL
            const cleanUrl = extractVideoId(url) || url;
            console.log(`Fetching info for: ${cleanUrl}`);
            
            if (!cleanUrl) {
                throw new Error('Invalid URL');
            }
            
            // Fetch video metadata
            const info = await ytDlp(cleanUrl, {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: ['referer:youtube.com', 'user-agent:googlebot']
            }, {
                timeout: 30000 // 30 second timeout
            });

            console.log(`✅ Successfully fetched: ${info.title}`);

            // Extract available resolutions
            const formats = info.formats || [];
            const resolutions = new Set();
            const audioFormats = new Set();
            
            formats.forEach(format => {
                // Video resolutions
                if (format.height && format.height >= 144) {
                    resolutions.add(format.height);
                }
                // Audio formats
                if (format.codec && format.codec.startsWith('mp4a') || format.codec === 'aac') {
                    audioFormats.add(`${format.abr || 128}kbps`);
                }
            });

            // Convert to array and sort
            const availableResolutions = Array.from(resolutions)
                .sort((a, b) => b - a)
                .map(h => `${h}p`);

            // Check for audio-only support
            const hasAudioOnly = info.formats && info.formats.some(f => 
                f.ext === 'm4a' || f.ext === 'mp3' || f.ext === 'webm'
            );

            console.log(`Available resolutions: ${availableResolutions.join(', ')}`);

            // Log successful video info fetch
            logger.info('Video info fetched successfully', {
                action: 'fetch_video_info',
                url: cleanUrl,
                videoTitle: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration,
                resolutions: availableResolutions,
                ip: req.userIp,
                location: req.userLocation,
                processingTime: Date.now() - startTime
            });

            res.json({
                success: true,
                title: info.title || 'Unknown Title',
                thumbnail: info.thumbnail || '',
                duration: info.duration || 0,
                resolutions: availableResolutions.length > 0 ? availableResolutions : ['best'],
                hasAudioOnly: hasAudioOnly,
                audioQualities: Array.from(audioFormats)
            });
        } catch (error) {
            console.error('❌ Error fetching video info:');
            console.error('Error message:', error.message);
            console.error('Error stderr:', error.stderr);
            
            let userMessage = 'Failed to fetch video info.';
            
            if (error.stderr && error.stderr.includes('Video unavailable')) {
                userMessage = 'Video unavailable. It may be deleted, private, or blocked in your region.';
            } else if (error.stderr && error.stderr.includes('Sign in to confirm your age')) {
                userMessage = 'Video requires age verification. Try another video.';
            } else if (error.message && error.message.includes('ENOTFOUND')) {
                userMessage = 'Cannot connect to YouTube. Check your internet connection.';
            } else if (error.message && error.message.includes('Invalid URL')) {
                userMessage = 'Invalid URL. Please enter a valid YouTube URL.';
            }

            logger.error('Failed to fetch video info', {
                action: 'fetch_video_info',
                url: req.body.url,
                error: userMessage,
                errorDetails: error.message,
                ip: req.userIp,
                location: req.userLocation,
                processingTime: Date.now() - startTime
            });
            
            res.status(500).json({ 
                error: userMessage,
                details: error.message 
            });
        }
    }
);

// =====================
// Single Download Endpoint
// =====================
app.post('/api/download', 
    downloadRateLimiter, 
    validate(downloadSchema),
    async (req, res) => {
        const { url, resolution, format, clientId } = req.validatedBody; // clientId from frontend
        const startTime = Date.now();
        let tempFilePath = null;

        try {
            const cleanUrl = extractVideoId(url) || url;
            console.log(`Processing: ${cleanUrl} with resolution: ${resolution}, format: ${format}`);
            
            // Fetch video info first
            const info = await ytDlp(cleanUrl, {
                dumpSingleJson: true,
                noWarnings: true,
            }, {
                timeout: 30000
            });

            const videoTitle = sanitizeFilename(info.title || 'video');
            const resolutionLabel = resolution || 'best';
            
            // Determine filename based on format
            let finalFileName;
            if (format === 'audio') {
                finalFileName = `${videoTitle}.mp3`;
            } else {
                finalFileName = `${videoTitle}-${resolutionLabel}.${format || 'mp4'}`;
            }
            
            // Use temp folder
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
            tempFilePath = path.join(tempDir, `${tempId}.${format === 'audio' ? 'mp3' : 'mp4'}`);

            // Determine format based on user selection
            let formatString;
            if (format === 'audio') {
                // Audio only download
                formatString = 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio';
            } else if (resolution && resolution !== 'best') {
                const height = resolution.replace('p', '');
                formatString = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
            } else {
                formatString = 'bestvideo+bestaudio/best';
            }

            // Start with base args
            const args = [
                cleanUrl,
                '--output', tempFilePath,
                '--no-check-certificates',
                '--newline', // Force newlines for progress parsing
                '--add-header', 'referer:youtube.com',
                '--add-header', 'user-agent:googlebot',
                '--add-metadata',
                '--embed-thumbnail'
            ];

            // Use local ffmpeg-static for portability
            const ffmpegPath = require('ffmpeg-static');
            if (ffmpegPath) {
                args.push('--ffmpeg-location', ffmpegPath);
                // console.log(`Using local ffmpeg: ${ffmpegPath}`);
            } else {
                console.warn('ffmpeg-static not found, falling back to system PATH');
            }

            if (formatString) {
                args.push('--format', formatString);
            }

            // Add format-specific options
            if (format === 'audio') {
                args.push('--extract-audio');
                args.push('--audio-format', 'mp3');
                args.push('--audio-quality', '0');
            } else if (format === 'mp4') {
                args.push('--merge-output-format', 'mp4');
            } else if (format === 'webm') {
                args.push('--merge-output-format', 'webm');
            }

            // Execute with spawn for real-time output
            const { spawn } = require('child_process');
            // Path to yt-dlp binary from yt-dlp-exec package
            const ytDlpBinary = require('yt-dlp-exec').create().getBinaryPath ? 
                              require('yt-dlp-exec').create().getBinaryPath() : // If older version
                              path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe'); // Fallback

            // Use the binary path if available, otherwise rely on system path or package internal logic
            // Since finding the exact binary path via package exports can be tricky across versions,
            // we'll try to use the one we found or the package itself if it exposes it.
            // A safer bet with the wrapper installed is to use the wrapper's internal binary path logic if possible,
            // but for now, let's use the layout we found: node_modules/yt-dlp-exec/bin/yt-dlp.exe
            // OR simpler: just use valid command if it was in path. 
            // Better: Use `ytDlp` (the wrapper) but use `.exec` with `{ stdio: ['ignore', 'pipe', 'pipe'] }`? 
            // The wrapper uses `execa` which buffers.
            
            // Let's use the absolute path we found
            const exePath = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');
            
            console.log(`Spawning yt-dlp from: ${exePath}`);
            const subprocess = spawn(exePath, args, {
                env: { ...process.env, PYTHONUNBUFFERED: '1' } // Force unbuffered Python output
            });
            
            let stdoutBuffer = '';
            let stderrBuffer = '';

            const processLine = (line, source) => {
                // Robust ANSI stripping
                // eslint-disable-next-line no-control-regex
                const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                
                // Regex to find percentages: looks for whitespace-or-start, digits, optional dot+digits, percent
                const matches = [...cleanLine.matchAll(/(?:\s|^|\[)(\d{1,3}(?:\.\d+)?)%/g)];
                
                if (matches.length > 0 && clientId) {
                    const lastMatch = matches[matches.length - 1];
                    const lastPercent = parseFloat(lastMatch[1]);
                    
                    if (!isNaN(lastPercent) && lastPercent >= 0 && lastPercent <= 100) {
                        sendProgress(clientId, { type: 'progress', percent: lastPercent, text: 'Downloading...' });
                    }
                }
                
                if (cleanLine.includes('Merger') || cleanLine.includes('Deleting original file')) {
                     if (clientId) sendProgress(clientId, { type: 'progress', percent: 99, text: 'Merging/Finalizing...' });
                }
            };

            const handleData = (data, source) => {
                const chunk = data.toString();
                let buffer = source === 'STDOUT' ? stdoutBuffer : stderrBuffer;
                
                buffer += chunk;
                
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    processLine(line, source);
                    buffer = buffer.substring(newlineIndex + 1);
                }
                
                // Update persistent buffer
                if (source === 'STDOUT') stdoutBuffer = buffer;
                else stderrBuffer = buffer;
            };

            subprocess.stdout.on('data', (data) => handleData(data, 'STDOUT'));
            subprocess.stderr.on('data', (data) => handleData(data, 'STDERR'));

            await new Promise((resolve, reject) => {
                subprocess.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Process exited with code ${code}`));
                });
                subprocess.on('error', (err) => reject(err));
            });

            console.log(`✅ Download complete: ${finalFileName}`);
            if (clientId) sendProgress(clientId, { type: 'complete', percent: 100, text: 'Download complete!' });

            // For audio, we might need to convert (handled by yt-dlp usually, but double check)
             if (format === 'audio' && !fs.existsSync(tempFilePath) && fs.existsSync(tempFilePath.replace(/\.[^/.]+$/, '.mp3'))) {
                tempFilePath = tempFilePath.replace(/\.[^/.]+$/, '.mp3');
            }

            // Get file size
            const fileStats = fs.statSync(tempFilePath);
            const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

            // Log successful download
            logger.info('Video downloaded successfully', {
                action: 'download_video',
                url: cleanUrl,
                videoTitle: info.title,
                resolution: resolutionLabel,
                format: format || 'mp4',
                fileSize: `${fileSizeMB} MB`,
                ip: req.userIp,
                location: req.userLocation,
                processingTime: Date.now() - startTime
            });

            // Send file to client
            const contentType = format === 'audio' ? 'audio/mpeg' : 'video/mp4';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
            res.setHeader('Content-Length', fileStats.size);
            
            // Stream file
            const fileStream = fs.createReadStream(tempFilePath);
            
            fileStream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to send file.' });
                }
            });

            fileStream.on('end', () => {
                // Clean up temp file
                fs.unlink(tempFilePath, (err) => {
                    if (err) console.error('Failed to delete temp file:', err);
                    else console.log(`🗑️ Cleaned up temp file: ${path.basename(tempFilePath)}`);
                });
            });

            fileStream.pipe(res);

        } catch (error) {
            console.error(error);
            if (clientId) sendProgress(clientId, { type: 'error', text: 'Download failed.' });
            
            logger.error('Failed to download video', {
                action: 'download_video',
                url: req.body.url,
                resolution: req.body.resolution || 'best',
                format: req.body.format || 'mp4',
                error: error.message,
                ip: req.userIp,
                location: req.userLocation,
                processingTime: Date.now() - startTime
            });

            // Clean up temp file
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log(`🗑️ Cleaned up temp file after error: ${path.basename(tempFilePath)}`);
            }
            
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to download video. Make sure URL is valid and try again.' });
            }
        }
    }
);

// =====================
// Batch Download Endpoint
// =====================
const limit = pLimit(3); // Limit to 3 concurrent downloads

app.post('/api/batch-download',
    downloadRateLimiter,
    validate(batchDownloadSchema),
    async (req, res) => {
        const { urls, resolution, format } = req.validatedBody;
        const startTime = Date.now();

        try {
            const results = [];
            const errors = [];

            // Process URLs concurrently with limit
            const tasks = urls.map(url => limit(async () => {
                 try {
                    const cleanUrl = extractVideoId(url) || url;
                    
                    // Fetch video info
                    const info = await ytDlp(cleanUrl, {
                        dumpSingleJson: true,
                        noWarnings: true,
                    }, {
                        timeout: 30000
                    });

                    return {
                        success: true,
                        data: {
                            url: url, // Return original URL to match validation schema in /api/download
                            title: info.title,
                            thumbnail: info.thumbnail,
                            success: true
                        }
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: {
                             url: url,
                             error: error.message
                        }
                    };
                }
            }));

            const processingResults = await Promise.all(tasks);
            
            processingResults.forEach(r => {
                if (r.success) results.push(r.data);
                else errors.push(r.error);
            });

            logger.info('Batch info fetched', {
                action: 'batch_fetch_video_info',
                total: urls.length,
                success: results.length,
                failed: errors.length,
                ip: req.userIp,
                processingTime: Date.now() - startTime
            });

            res.json({
                success: true,
                results: results,
                errors: errors,
                summary: {
                    total: urls.length,
                    successful: results.length,
                    failed: errors.length
                }
            });

        } catch (error) {
            console.error('Batch download error:', error);
            
            logger.error('Failed batch download', {
                action: 'batch_download',
                url: req.body.urls,
                error: error.message,
                ip: req.userIp
            });
            
            res.status(500).json({ error: 'Failed to process batch request' });
        }
    }
);

// =====================
// Admin Endpoints
// =====================

// Redirect /admin-old to /admin-old.html
app.get('/admin-old', (req, res) => {
    res.redirect('/admin-old.html');
});

app.get('/admin/logs', adminRateLimiter, authMiddleware, (req, res) => {
    const startTime = Date.now();
    const isAutoRefresh = req.headers['x-auto-refresh'] === 'true';
    
    try {
        const logsDir = path.join(__dirname, 'logs');
        
        if (!fs.existsSync(logsDir)) {
            return res.json({ 
                success: true, 
                logs: [], 
                message: 'No logs directory found yet.' 
            });
        }

        const files = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log'))
            .map(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    date: file.replace('access-', '').replace('.log', ''),
                    size: `${(stats.size / 1024).toFixed(2)} KB`,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        if (!isAutoRefresh) {
            logger.info('Admin viewed log files list', {
                action: 'admin_view_log_list',
                filesCount: files.length,
                ip: req.userIp,
                location: req.userLocation,
                processingTime: Date.now() - startTime
            });
        }

        res.json({ success: true, logs: files });
    } catch (error) {
        logger.error('Failed to list log files', { 
            action: 'admin_view_log_list',
            error: error.message,
            ip: req.userIp,
            location: req.userLocation
        });
        res.status(500).json({ error: 'Failed to retrieve log files' });
    }
});

app.get('/admin/logs/:date', adminRateLimiter, authMiddleware, (req, res) => {
    const startTime = Date.now();
    const isAutoRefresh = req.headers['x-auto-refresh'] === 'true';
    const { date } = req.params;
    const { filter, search } = req.query;
    
    try {
        const logsDir = path.join(__dirname, 'logs');
        const logFile = path.join(logsDir, `access-${date}.log`);

        if (!fs.existsSync(logFile)) {
            return res.status(404).json({ 
                error: `No logs found for date: ${date}` 
            });
        }

        const fileContent = fs.readFileSync(logFile, 'utf-8');
        let logLines = fileContent
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return { raw: line, timestamp: date };
                }
            });

        // Apply filters
        if (filter) {
            logLines = logLines.filter(log => log.action === filter);
        }

        if (search) {
            const searchLower = search.toLowerCase();
            logLines = logLines.filter(log => 
                log.videoTitle?.toLowerCase().includes(searchLower) ||
                log.url?.toLowerCase().includes(searchLower) ||
                log.ip?.includes(search)
            );
        }

        if (!isAutoRefresh) {
            logger.info('Admin viewed specific log file', {
                action: 'admin_view_log_detail',
                date: date,
                entriesCount: logLines.length,
                ip: req.userIp,
                location: req.userLocation,
                processingTime: Date.now() - startTime
            });
        }

        res.json({ 
            success: true, 
            date: date,
            count: logLines.length,
            logs: logLines 
        });
    } catch (error) {
        logger.error('Failed to read log file', { 
            action: 'admin_view_log_detail',
            date: req.params.date, 
            error: error.message,
            ip: req.userIp,
            location: req.userLocation
        });
        res.status(500).json({ error: 'Failed to read log file' });
    }
});

app.delete('/admin/logs/:date', adminRateLimiter, authMiddleware, (req, res) => {
    const { date } = req.params;
    
    try {
        const logsDir = path.join(__dirname, 'logs');
        
        if (date === 'all') {
            if (!fs.existsSync(logsDir)) {
                return res.json({ 
                    success: true, 
                    message: 'No logs directory found' 
                });
            }
            
            const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                fs.writeFileSync(filePath, '', 'utf8');
            });
            
            logger.info('All log files cleared', { 
                action: 'admin_clear_all_logs',
                count: files.length,
                clearedBy: req.userIp 
            });
            
            return res.json({ 
                success: true, 
                message: `Cleared ${files.length} log file(s)`,
                cleared: files 
            });
        }
        
        const logFile = path.join(logsDir, `access-${date}.log`);
        
        if (!fs.existsSync(logFile)) {
            return res.status(404).json({ 
                error: `Log file for date ${date} not found` 
            });
        }
        
        fs.writeFileSync(logFile, '', 'utf8');
        
        logger.info('Log file cleared', { 
            action: 'admin_clear_log',
            date: date,
            clearedBy: req.userIp 
        });
        
        res.json({ 
            success: true, 
            message: `Log file for ${date} cleared successfully` 
        });
    } catch (error) {
        logger.error('Failed to clear log file', { 
            date: req.params.date, 
            error: error.message 
        });
        res.status(500).json({ error: 'Failed to clear log file' });
    }
});

// =====================
// Admin Dashboard Stats
// =====================
app.get('/admin/stats', adminRateLimiter, authMiddleware, (req, res) => {
    const startTime = Date.now();
    
    try {
        const logsDir = path.join(__dirname, 'logs');
        let totalDownloads = 0;
        let totalVideoInfo = 0;
        let uniqueIPs = new Set();
        let topVideos = {};
        
        if (fs.existsSync(logsDir)) {
            const files = fs.readdirSync(logsDir)
                .filter(file => file.endsWith('.log'))
                .slice(0, 7); // Last 7 days

            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n').filter(l => l.trim());

                lines.forEach(line => {
                    try {
                        const log = JSON.parse(line);
                        
                        if (log.action === 'download_video' && log.level !== 'error') {
                            totalDownloads++;
                            uniqueIPs.add(log.ip);
                            
                            if (log.videoTitle) {
                                topVideos[log.videoTitle] = (topVideos[log.videoTitle] || 0) + 1;
                            }
                        }
                        
                        if (log.action === 'fetch_video_info') {
                            totalVideoInfo++;
                        }
                    } catch (e) {}
                });
            });
        }

        // Sort top videos
        const sortedTopVideos = Object.entries(topVideos)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([title, count]) => ({ title, count }));

        logger.info('Admin viewed stats', {
            action: 'admin_view_stats',
            ip: req.userIp,
            processingTime: Date.now() - startTime
        });

        res.json({
            success: true,
            stats: {
                totalDownloads,
                totalVideoInfo,
                uniqueVisitors: uniqueIPs.size,
                topVideos: sortedTopVideos,
                serverUptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            }
        });

    } catch (error) {
        logger.error('Failed to get stats', { 
            action: 'admin_get_stats',
            error: error.message 
        });
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// =====================
// Helper Functions
// =====================

/**
 * Sanitize filename
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 200);
}

/**
 * Convert audio to MP3 using FFmpeg
 */
function convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-vn',
            '-acodec', 'libmp3lame',
            '-q:a', '2',
            '-y',
            outputPath
        ]);

        ffmpeg.stderr.on('data', (data) => {
            console.log(`FFmpeg: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error('FFmpeg conversion failed'));
            }
        });
    });
}

/**
 * Get disk usage
 */
function getDiskUsage() {
    try {
        const stats = fs.statSync(__dirname);
        const disk = require('diskusage');
        const rootPath = path.parse(__dirname).root;
        
        return new Promise((resolve) => {
            disk.check(rootPath, (err, info) => {
                if (err) {
                    resolve({ available: 'Unknown', total: 'Unknown' });
                } else {
                    resolve({
                        available: `${(info.available / (1024 * 1024 * 1024)).toFixed(2)} GB`,
                        total: `${(info.total / (1024 * 1024 * 1024)).toFixed(2)} GB`,
                        usedPercent: `${((info.total - info.available) / info.total * 100).toFixed(1)}%`
                    });
                }
            });
        });
    } catch (error) {
        return { available: 'Unknown', total: 'Unknown' };
    }
}

// =====================
// Auto Cleanup Task
// =====================
function cleanOldTempFiles() {
    const tempDir = path.join(__dirname, 'temp');
    const MAX_AGE = 60 * 60 * 1000; // 1 hour

    if (fs.existsSync(tempDir)) {
        fs.readdir(tempDir, (err, files) => {
            if (err) return console.error('Cleanup error:', err);
            
            files.forEach(file => {
                const filePath = path.join(tempDir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    if (Date.now() - stats.mtime.getTime() > MAX_AGE) {
                        fs.unlink(filePath, () => console.log(`🗑️ Auto-deleted old file: ${file}`));
                    }
                });
            });
        });
    }
}

// Run cleanup every hour
setInterval(cleanOldTempFiles, 60 * 60 * 1000);
// Run on startup
cleanOldTempFiles();

// =====================
// Environment Validation
// =====================
function validateEnv() {
    const required = ['ADMIN_API_KEY'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.warn('⚠️  Warning: Missing environment variables:');
        missing.forEach(key => console.warn(`   - ${key}`));
        console.warn('   Please copy .env.example to .env and configure.\n');
    }
    
    // Check for yt-dlp
    try {
        const { execSync } = require('child_process');
        execSync('yt-dlp --version', { stdio: 'ignore' });
        console.log('✅ yt-dlp is installed');
    } catch {
        console.warn('⚠️  Warning: yt-dlp is not installed.');
        console.warn('   Install via: pip install yt-dlp or download from https://github.com/yt-dlp/yt-dlp');
    }
    
    // Check for FFmpeg
    try {
        const { execSync } = require('child_process');
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('✅ FFmpeg is installed\n');
    } catch {
        console.warn('⚠️  Warning: FFmpeg is not installed.');
        console.warn('   FFmpeg is required for video+audio merging.');
        console.warn('   Install via: https://ffmpeg.org/download.html\n');
    }
}

// =====================
// Server Startup
// =====================
validateEnv();

const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const SSL_KEY = process.env.SSL_KEY_PATH;
const SSL_CERT = process.env.SSL_CERT_PATH;

// HTTPS Server
if (USE_HTTPS && SSL_KEY && SSL_CERT && fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
    const httpsServer = https.createServer({
        key: fs.readFileSync(SSL_KEY),
        cert: fs.readFileSync(SSL_CERT)
    }, app);

    httpsServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Re-Watch server running at https://localhost:${PORT}`);
    });
} else {
    // HTTP Server
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Re-Watch server running at http://localhost:${PORT}`);
    });
}
