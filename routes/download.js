const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const youtubeService = require('../services/youtubeService');
const { validate, downloadSchema, batchDownloadSchema, extractVideoId } = require('../middleware/validation');
const { downloadRateLimiter } = require('../middleware/rate-limit');
const logger = require('../logger');
const pLimit = require('p-limit');

// SSE Clients
let clients = [];

const sendProgress = (clientId, data) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof client.res.flush === 'function') client.res.flush();
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
        let tempFilePath = null;

        try {
            const cleanUrl = extractVideoId(url) || url;
            
            // Get info for filename
            // Get info for filename
            const info = await youtubeService.getVideoInfo(cleanUrl);
            const videoTitle = (info.title || 'video').replace(/[<>:"/\\|?*]/g, '');
            
            // Setup temp path
            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const ext = format === 'audio' ? 'mp3' : format || 'mp4';
            tempFilePath = path.join(tempDir, `${tempId}.${ext}`);

            // Download
            await youtubeService.downloadVideo(cleanUrl, {
                tempFilePath,
                format,
                resolution
            }, (progress) => {
                if (clientId) sendProgress(clientId, { type: 'progress', ...progress });
            });

            if (clientId) sendProgress(clientId, { type: 'complete', percent: 100, text: 'Download complete!' });

            // Send file
            const finalFileName = `${videoTitle}.${ext}`;
            res.download(tempFilePath, finalFileName, (err) => {
                if (err) console.error('Send file error:', err);
                // Cleanup
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            });

            logger.info('Video downloaded successfully', {
                action: 'download_video',
                url: cleanUrl,
                format,
                processingTime: Date.now() - startTime
            });

        } catch (error) {
            if (clientId) sendProgress(clientId, { type: 'error', text: 'Download failed.' });
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            next(error);
        }
    }
);

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
