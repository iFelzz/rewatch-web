const ytDlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

class YouTubeService {
    constructor() {
        this.ffmpegPath = this._getFfmpegPath();
    }

    _getFfmpegPath() {
        try {
            return require('ffmpeg-static');
        } catch (e) {
            console.warn('ffmpeg-static not found, falling back to system PATH');
            return null;
        }
    }

    _getYtDlpBinary() {
        // Safe binary path resolution
        try {
            return require('yt-dlp-exec').create().getBinaryPath();
        } catch (e) {
            return path.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');
        }
    }

    async getVideoInfo(url) {
        const cookiesPath = path.join(__dirname, '..', 'config', 'cookies.txt');
        const args = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot']
        };

        if (fs.existsSync(cookiesPath)) {
            args.cookies = cookiesPath;
        }

        return await ytDlp(url, args, {
            timeout: 30000
        });
    }

    async getPlaylistInfo(url) {
        const cookiesPath = path.join(__dirname, '..', 'config', 'cookies.txt');
        const args = {
            dumpSingleJson: true,
            flatPlaylist: true, // Only get metadata, don't download
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot']
        };

        if (fs.existsSync(cookiesPath)) {
            args.cookies = cookiesPath;
        }

        return await ytDlp(url, args, {
            timeout: 60000 // Longer timeout for playlists
        });
    }

    async downloadVideo(url, options, onProgress) {
        const { tempFilePath, format, resolution } = options;
        
        let formatString;
        if (format === 'audio') {
            formatString = 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio';
        } else if (resolution && resolution !== 'best') {
            const height = resolution.replace('p', '');
            formatString = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
        } else {
            formatString = 'bestvideo+bestaudio/best';
        }

        const args = [
            url,
            '--output', tempFilePath,
            '--no-check-certificates',
            '--newline',
            '--add-header', 'user-agent:googlebot',
            '--add-metadata',
            '--embed-thumbnail'
        ];

        // Check for cookies.txt
        const cookiesPath = path.join(__dirname, '..', 'config', 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            args.push('--cookies', cookiesPath);
        }

        if (this.ffmpegPath) {
            args.push('--ffmpeg-location', this.ffmpegPath);
        }

        if (formatString) {
            args.push('--format', formatString);
        }

        if (format === 'audio') {
            args.push('--extract-audio');
            args.push('--audio-format', 'mp3');
            args.push('--audio-quality', '0');
        } else if (format === 'mp4') {
            args.push('--merge-output-format', 'mp4');
        } else if (format === 'webm') {
            args.push('--merge-output-format', 'webm');
        }

        const { spawn } = require('child_process');
        const exePath = this._getYtDlpBinary();

        console.log(`Spawning yt-dlp from: ${exePath}`);
        
        const subprocess = spawn(exePath, args, {
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let stdoutBuffer = '';
            
        // Process output for progress
        const processOutput = (data) => {
            const chunk = data.toString();
            stdoutBuffer += chunk;
            
            let newlineIndex;
            while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
                const line = stdoutBuffer.substring(0, newlineIndex);
                // Clean ANSI
                const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                
                // Parse percentage
                const matches = [...cleanLine.matchAll(/(?:\s|^|\[)(\d{1,3}(?:\.\d+)?)%/g)];
                if (matches.length > 0 && onProgress) {
                    const lastMatch = matches[matches.length - 1];
                    const percent = parseFloat(lastMatch[1]);
                    if (!isNaN(percent)) {
                        onProgress({ percent, text: 'Downloading...' });
                    }
                }
                
                if ((cleanLine.includes('Merger') || cleanLine.includes('Deleting original file')) && onProgress) {
                    onProgress({ percent: 99, text: 'Merging/Finalizing...' });
                }

                stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);
            }
        };

        subprocess.stdout.on('data', processOutput);
        subprocess.stderr.on('data', processOutput); // Sometimes yt-dlp prints progress to stderr

        return new Promise((resolve, reject) => {
            subprocess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Process exited with code ${code}`));
            });
            subprocess.on('error', reject);
        });
    }
}

module.exports = new YouTubeService();
