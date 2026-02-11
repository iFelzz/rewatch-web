require('dotenv').config();
const express = require('express');
const ytDlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const loggingMiddleware = require('./middleware/logging');
const authMiddleware = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Apply logging middleware to all routes
app.use(loggingMiddleware);

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
            
            // Handle youtube.com/shorts/... format
            const shortsMatch = urlObj.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
            if (shortsMatch && shortsMatch[1]) {
                return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
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

    const startTime = Date.now();

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

        // Log failed video info fetch
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
});

// Endpoint untuk download video
app.post('/download', async (req, res) => {
    const { url, resolution } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required!' });

    // Generate unique temp filename to avoid conflicts between users
    const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    let tempFilePath = null;
    const startTime = Date.now();

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
        const finalFileName = `${videoTitle}-${resolutionLabel}.mp4`;
        
        // Use temp folder with unique ID to avoid conflicts
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        tempFilePath = path.join(tempDir, `${tempId}.mp4`);

        // Determine format based on resolution
        let formatString;
        if (resolution && resolution !== 'best') {
            const height = resolution.replace('p', '');
            // Get video with specific resolution + best audio
            formatString = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
        } else {
            formatString = 'bestvideo+bestaudio/best';
        }

        // Download video to temp location
        await ytDlp(cleanUrl, {
            format: formatString,
            mergeOutputFormat: 'mp4',
            output: tempFilePath,
        });

        console.log(`✅ Download complete: ${finalFileName}`);

        // Get file size
        const fileStats = fs.statSync(tempFilePath);
        const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

        // Log successful download
        logger.info('Video downloaded successfully', {
            action: 'download_video',
            url: cleanUrl,
            videoTitle: info.title,
            resolution: resolutionLabel,
            fileSize: `${fileSizeMB} MB`,
            ip: req.userIp,
            location: req.userLocation,
            processingTime: Date.now() - startTime
        });

        // Send file directly to browser with proper headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
        
        // Stream file to response
        const fileStream = fs.createReadStream(tempFilePath);
        
        fileStream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to send file.' });
            }
        });

        fileStream.on('end', () => {
            // Delete temp file after sending
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Failed to delete temp file:', err);
                else console.log(`🗑️ Cleaned up temp file: ${tempId}.mp4`);
            });
        });

        fileStream.pipe(res);

    } catch (error) {
        console.error(error);
        
        // Log failed download
        logger.error('Failed to download video', {
            action: 'download_video',
            url: req.body.url,
            resolution: req.body.resolution || 'best',
            error: error.message,
            ip: req.userIp,
            location: req.userLocation,
            processingTime: Date.now() - startTime
        });

        // Clean up temp file if exists
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`🗑️ Cleaned up temp file after error: ${tempId}.mp4`);
        }
        
        res.status(500).json({ error: 'Failed to download video. Make sure URL is valid and try again.' });
    }
});

// Admin endpoint untuk list semua log files
app.get('/admin/logs', authMiddleware, (req, res) => {
    const startTime = Date.now();
    const isAutoRefresh = req.headers['x-auto-refresh'] === 'true';
    
    try {
        const logsDir = path.join(__dirname, 'logs');
        
        // Check if logs directory exists
        if (!fs.existsSync(logsDir)) {
            return res.json({ 
                success: true, 
                logs: [], 
                message: 'No logs directory found yet. Logs will be created after first request.' 
            });
        }

        // Read all log files
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

        // Log admin action ONLY if NOT auto-refresh
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

// Admin endpoint untuk view log dari tanggal tertentu
app.get('/admin/logs/:date', authMiddleware, (req, res) => {
    const startTime = Date.now();
    const isAutoRefresh = req.headers['x-auto-refresh'] === 'true';
    
    try {
        const { date } = req.params;
        const logsDir = path.join(__dirname, 'logs');
        const logFile = path.join(logsDir, `access-${date}.log`);

        // Check if log file exists
        if (!fs.existsSync(logFile)) {
            return res.status(404).json({ 
                error: `No logs found for date: ${date}` 
            });
        }

        // Read log file and parse JSON lines
        const fileContent = fs.readFileSync(logFile, 'utf-8');
        const logLines = fileContent
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return { raw: line };
                }
            });

        // Log admin action ONLY if NOT auto-refresh
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

// Admin endpoint untuk delete/clear log file
app.delete('/admin/logs/:date', authMiddleware, (req, res) => {
    try {
        const { date } = req.params;
        const logsDir = path.join(__dirname, 'logs');
        
        // Special case: "all" means clear all log files
        if (date === 'all') {
            if (!fs.existsSync(logsDir)) {
                return res.json({ 
                    success: true, 
                    message: 'No logs directory found, nothing to clear' 
                });
            }
            
            // Clear all .log files (empty their contents)
            const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                fs.writeFileSync(filePath, '', 'utf8'); // Empty the file
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
        
        // Clear specific date log file
        const logFile = path.join(logsDir, `access-${date}.log`);
        
        if (!fs.existsSync(logFile)) {
            return res.status(404).json({ 
                error: `Log file for date ${date} not found` 
            });
        }
        
        // Clear file contents instead of deleting
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

// Remove the static file serving endpoint since we're not storing files anymore
// app.use('/files', express.static(path.join(__dirname, 'downloads')));

app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Re-Watch server running at http://localhost:3000');
    console.log('📡 Also accessible on your local network at:');
    console.log('   Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)');
    console.log('   Then access via: http://YOUR_LOCAL_IP:3000');
});