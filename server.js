const express = require('express');
const ytDlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Helper function untuk extract video ID dari URL YouTube
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        
        // Handle youtube.com/watch?v=... format
        if (urlObj.hostname.includes('youtube.com')) {
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }
        
        // Handle youtu.be/... format
        if (urlObj.hostname.includes('youtu.be')) {
            const videoId = urlObj.pathname.substring(1);
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }
        
        // Kalau ga match format YouTube, return original
        return url;
    } catch (error) {
        // Kalau URL invalid, return original
        return url;
    }
}

// Helper function untuk sanitize filename
function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '') // Hapus karakter illegal
        .replace(/\s+/g, '-') // Replace spaces dengan dash
        .substring(0, 200); // Limit panjang filename
}

// Endpoint untuk fetch video info dan available resolutions
app.post('/video-info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required!' });

    try {
        // Extract video ID only, ignore playlist/radio parameters
        const cleanUrl = extractVideoId(url);
        console.log(`Fetching info: ${cleanUrl}`);
        
        // Fetch video metadata
        const info = await ytDlp(cleanUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot']
        });

        console.log(`✅ Successfully fetched: ${info.title}`);

        // Extract available resolutions (filter video+audio atau combined)
        const formats = info.formats || [];
        const resolutions = new Set();
        
        formats.forEach(format => {
            // Ambil format yang punya height (video)
            if (format.height && format.height >= 144) {
                resolutions.add(format.height);
            }
        });

        // Convert Set ke Array dan sort descending
        const availableResolutions = Array.from(resolutions)
            .sort((a, b) => b - a)
            .map(h => `${h}p`);

        console.log(`Available resolutions: ${availableResolutions.join(', ')}`);

        res.json({
            success: true,
            title: info.title || 'Unknown Title',
            thumbnail: info.thumbnail || '',
            duration: info.duration || 0,
            resolutions: availableResolutions.length > 0 ? availableResolutions : ['best']
        });
    } catch (error) {
        console.error('❌ Error fetching video info:');
        console.error('Error message:', error.message);
        console.error('Error stderr:', error.stderr);
        
        // Parse error to provide more specific messages
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
        
        res.status(500).json({ 
            error: userMessage,
            details: error.message 
        });
    }
});

// Endpoint untuk download video
app.post('/download', async (req, res) => {
    const { url, resolution } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required!' });

    try {
        // Extract video ID only, ignore playlist/radio parameters
        const cleanUrl = extractVideoId(url);
        console.log(`Processing: ${cleanUrl} with resolution: ${resolution || 'best'}`);
        
        // Fetch video info first to get title
        const info = await ytDlp(cleanUrl, {
            dumpSingleJson: true,
            noWarnings: true,
        });

        const videoTitle = sanitizeFilename(info.title || 'video');
        const resolutionLabel = resolution || 'best';
        const fileName = `${videoTitle}-${resolutionLabel}.mp4`;
        const filePath = path.join(__dirname, 'downloads', fileName);

        // Determine format based on resolution
        let formatString;
        if (resolution && resolution !== 'best') {
            const height = resolution.replace('p', '');
            // Get video with specific resolution + best audio
            formatString = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
        } else {
            formatString = 'bestvideo+bestaudio/best';
        }

        // Download video
        await ytDlp(cleanUrl, {
            format: formatString,
            mergeOutputFormat: 'mp4',
            output: filePath,
        });

        res.json({ 
            success: true, 
            downloadUrl: `/files/${encodeURIComponent(fileName)}`,
            filename: fileName
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to download video. Make sure URL is valid and try again.' });
    }
});

// Endpoint untuk serving file hasil download
app.use('/files', express.static(path.join(__dirname, 'downloads')));

app.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));