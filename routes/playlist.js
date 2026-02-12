const express = require('express');
const router = express.Router();
const youtubeService = require('../services/youtubeService');
const { apiRateLimiter } = require('../middleware/rate-limit');
const logger = require('../logger');

router.post('/playlist-info', 
    apiRateLimiter,
    async (req, res, next) => {
        const { url } = req.body;
        const startTime = Date.now();

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            console.log(`Fetching playlist info for: ${url}`);
            
            const info = await youtubeService.getPlaylistInfo(url);
            
            if (!info || !info.entries) {
                throw new Error('Invalid playlist or no entries found');
            }

            const entries = info.entries.map(entry => ({
                id: entry.id,
                title: entry.title || 'Unknown Title',
                url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
                duration: entry.duration,
                thumbnail: entry.thumbnails ? entry.thumbnails[entry.thumbnails.length - 1].url : null
            }));

            logger.info('Playlist info fetched', {
                action: 'fetch_playlist_info',
                url: url,
                count: entries.length,
                ip: req.ip,
                processingTime: Date.now() - startTime
            });

            res.json({
                success: true,
                title: info.title || 'Unknown Playlist',
                itemCount: entries.length,
                entries: entries
            });

        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
