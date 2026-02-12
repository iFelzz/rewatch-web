const express = require('express');
const router = express.Router();
const youtubeService = require('../services/youtubeService');
const { validate, videoInfoSchema, extractVideoId } = require('../middleware/validation');
const { apiRateLimiter } = require('../middleware/rate-limit');
const logger = require('../logger');

router.post('/video-info', 
    apiRateLimiter, 
    validate(videoInfoSchema),
    async (req, res, next) => {
        const { url } = req.validatedBody;
        const startTime = Date.now();

        try {
            const cleanUrl = extractVideoId(url) || url;
            console.log(`Fetching info for: ${cleanUrl}`);
            
            if (!cleanUrl) throw new Error('Invalid URL');
            
            const info = await youtubeService.getVideoInfo(cleanUrl);

            // Extract resolutions logic
            const formats = info.formats || [];
            const resolutions = new Set();
            const audioFormats = new Set();
            
            formats.forEach(format => {
                if (format.height && format.height >= 144) resolutions.add(format.height);
                if (format.codec && (format.codec.startsWith('mp4a') || format.codec === 'aac')) {
                    audioFormats.add(`${format.abr || 128}kbps`);
                }
            });

            const availableResolutions = Array.from(resolutions)
                .sort((a, b) => b - a)
                .map(h => `${h}p`);

            const hasAudioOnly = info.formats && info.formats.some(f => 
                f.ext === 'm4a' || f.ext === 'mp3' || f.ext === 'webm'
            );

            logger.info('Video info fetched successfully', {
                action: 'fetch_video_info',
                url: cleanUrl,
                videoTitle: info.title,
                resolutions: availableResolutions,
                ip: req.ip,
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
            next(error);
        }
    }
);

module.exports = router;
