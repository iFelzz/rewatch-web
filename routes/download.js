const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const youtubeService = require('../services/youtubeService');
const { validate, downloadSchema, batchDownloadSchema, extractVideoId } = require('../middleware/validation');
const { downloadRateLimiter } = require('../middleware/rate-limit');
const logger = require('../logger');
const pLimit = require('p-limit');
const checkDiskSpace = require('check-disk-space').default || require('check-disk-space');
const config = require('../config');

// SSE Clients
let clients = [];
// Active Downloads Map (clientId -> subprocess)
const activeDownloads = new Map();

const sendProgress = (clientId, data) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof client.res.flush === 'function') client.res.flush();
    } else {
        logger.warn(`[DEBUG] SSE Client not found for ID: ${clientId}`);
    }
};

// SSE Endpoint
router.get('/progress', (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    };
    res.writeHead(200, headers);
    req.socket.setNoDelay(true);
    
    const clientId = req.query.clientId;
    clients.push({ id: clientId, res });
    res.write(':\n\n'); 

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

// Single Download
router.post('/download', 
    downloadRateLimiter, 
    validate(downloadSchema),
    async (req, res, next) => {
        const { url, resolution, format, clientId } = req.validatedBody;
        const startTime = Date.now();
        logger.info('[DEBUG] /download route hit', { url });
        let tempFilePath = null;

        try {
            logger.info('[DEBUG] Checking disk space...');
            
            const tempDir = config.DIR_TEMP;
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            try {
                const space = await checkDiskSpace(tempDir);
                if (space.free < 500 * 1024 * 1024) { // 500MB
                    logger.warn('[DEBUG] Low disk space', { free: space.free });
                    throw new Error('Server is running low on disk space. Please try again later.');
                }
                logger.info('[DEBUG] Disk space OK', { free: space.free });
            } catch (err) {
                logger.error('[DEBUG] Disk space check error:', { message: err.message });
                // logger.warn('Disk space check failed:', err); // Redundant
            }

            const cleanUrl = extractVideoId(url) || url;
            
            // Get info for filename
            logger.info('[DEBUG] Fetching video info', { cleanUrl });
            const info = await youtubeService.getVideoInfo(cleanUrl);
            logger.info('[DEBUG] Video info fetched', { title: info.title });
            
            const originalTitle = info.title || 'video';
            // Sanitize filename: 
            // 1. Remove quotes (single/double/smart) to prevent header issues
            // 2. Replace illegal chars with space
            // 3. Collapse multiple spaces
            let videoTitle = originalTitle
                .replace(/['"‘’“”`]/g, '') // Remove all quotes
                .replace(/[<>:"/\\|?*]/g, ' ') // Replace illegal chars with space
                .replace(/\s+/g, ' ') // Collapse spaces
                .trim();
                
            // Setup temp path (Already checked above)
            // const tempDir = path.join(__dirname, '..', 'temp');
            // if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const ext = format === 'audio' ? 'mp3' : format || 'mp4';
            tempFilePath = path.join(tempDir, `${tempId}.${ext}`);

            logger.info('Setup temp path complete', { tempFilePath });

            // Download
            logger.info('Starting downloadVideo...');
            await youtubeService.downloadVideo(cleanUrl, {
                tempFilePath,
                format,
                resolution
            }, (progress) => {
                // Only send progress if download is still active
                if (clientId && activeDownloads.has(clientId)) {
                    sendProgress(clientId, { type: 'progress', ...progress });
                }
            }, (subprocess) => {
                logger.info('Subprocess started', { pid: subprocess.pid });
                if (clientId) activeDownloads.set(clientId, subprocess);
            });

            logger.info('DownloadVideo returned promise resolved');

            if (clientId) {
                sendProgress(clientId, { type: 'complete', percent: 100, text: 'Download complete!' });
                activeDownloads.delete(clientId);
            }

            // Send file
            let finalFileName = videoTitle;
            if (resolution && format !== 'audio') {
                finalFileName += ` (${resolution})`;
            }
            finalFileName += `.${ext}`;
            
            logger.info('Sending file...', { finalFileName });

            res.download(tempFilePath, finalFileName, (err) => {
                if (err) logger.error('Send file error:', err);
                // Cleanup
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            });

            logger.info('Video downloaded successfully', {
                action: 'download_video',
                url: cleanUrl,
                format,
                finalFileName,
                processingTime: Date.now() - startTime
            });

        } catch (error) {
            logger.error('Route error caught:', error);

            // Check if error is due to cancellation (process killed)
            const isCancelled = error.message && (error.message.includes('killed') || error.message.includes('abort') || error.signal === 'SIGKILL');

            if (clientId && !isCancelled) {
                activeDownloads.delete(clientId);
                sendProgress(clientId, { type: 'error', text: 'Download failed.' });
            }
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            next(error);
        }
    }
);

// Cancel Download Endpoint
router.post('/cancel-download', (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Client ID required' });

    const subprocess = activeDownloads.get(clientId);
    if (subprocess) {
        // Use taskkill to kill process tree (yt-dlp + ffmpeg) on Windows
        const { exec } = require('child_process');
        exec(`taskkill /pid ${subprocess.pid} /f /t`, (err) => {
            if (err) {
                 // Fallback if taskkill fails (e.g. process already gone)
                 try { subprocess.kill('SIGKILL'); } catch (e) {}
            }
        });
        
        activeDownloads.delete(clientId);
        logger.info(`Download cancelled for client: ${clientId}`);
        return res.json({ success: true, message: 'Download cancelled' });
    }

    res.status(404).json({ error: 'No active download found' });
});

// Batch Download
const limit = pLimit(3);
router.post('/batch-download',
    downloadRateLimiter,
    validate(batchDownloadSchema),
    async (req, res, next) => {
        const { urls } = req.validatedBody;
        
        try {
            const tasks = urls.map(url => limit(async () => {
                try {
                    const cleanUrl = extractVideoId(url) || url;
                    const info = await youtubeService.getVideoInfo(cleanUrl);
                    return {
                        success: true,
                        data: {
                            url: url,
                            title: info.title,
                            thumbnail: info.thumbnail,
                            success: true
                        }
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: { url, error: error.message }
                    };
                }
            }));

            const results = await Promise.all(tasks);
            const success = results.filter(r => r.success).map(r => r.data);
            const errors = results.filter(r => !r.success).map(r => r.error);

            res.json({
                success: true,
                results: success,
                errors: errors
            });

        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
