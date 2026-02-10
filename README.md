# YouTube HD Downloader 🎬

A modern, web-based YouTube video downloader with customizable resolution selection. Built with Node.js and Express, featuring a beautiful glassmorphism UI design.

![YouTube HD Downloader](https://img.shields.io/badge/YouTube-Downloader-red?style=for-the-badge&logo=youtube)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

## ✨ Features

- 🎯 **Multiple Resolution Options** - Choose from 144p to 4K quality
- 📝 **Smart Filename** - Files saved with original video title
- 🎨 **Modern UI** - Beautiful glassmorphism design with smooth animations
- 🖼️ **Video Preview** - Thumbnail and duration display before download
- 🔗 **Playlist Support** - Automatically extracts video ID from playlist/radio URLs
- ⚡ **Fast & Efficient** - Powered by yt-dlp with automatic video+audio merging
- 🌐 **Web-Based** - No software installation needed, works in any browser
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices

## 🚀 Tech Stack

- **Backend**: Node.js + Express.js
- **Downloader**: yt-dlp-exec (yt-dlp wrapper)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Video Processing**: FFmpeg (automatic merging)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [FFmpeg](https://ffmpeg.org/download.html) (required for video+audio merging)

### Installing FFmpeg

**Windows:**
```bash
# Using Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg  # Debian/Ubuntu
sudo yum install ffmpeg  # CentOS/RHEL
```

## 🛠️ Installation

1. **Clone or download this repository**

2. **Navigate to the project directory**
   ```bash
   cd YT-Downloader-Web
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

## 💻 Usage

1. **Enter YouTube URL**
   - Paste any YouTube video URL (supports playlist/radio URLs too)
   - Examples:
     - `https://www.youtube.com/watch?v=VIDEO_ID`
     - `https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID`
     - `https://youtu.be/VIDEO_ID`

2. **Fetch Video Info**
   - Click "📋 Fetch Info" button
   - View video thumbnail, title, and duration
   - See available resolution options

3. **Select Resolution**
   - Choose your preferred quality from the dropdown
   - Options range from 144p to 4K (depending on video availability)

4. **Download**
   - Click "⬇️ Download Video" button
   - Wait for processing (download + merge)
   - Click the download link when ready

5. **Save File**
   - File will be named: `[Video-Title]-[Resolution].mp4`
   - Saved to the `downloads/` folder

## 📁 Project Structure

```
YT-Downloader-Web/
├── public/
│   └── index.html          # Frontend UI
├── downloads/              # Downloaded videos (auto-created)
├── node_modules/           # Dependencies
├── server.js              # Express server & API endpoints
├── package.json           # Project configuration
└── README.md             # This file
```

## 🎯 API Endpoints

### POST `/video-info`
Fetch video metadata and available resolutions.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": 300,
  "resolutions": ["2160p", "1440p", "1080p", "720p", "480p", "360p"]
}
```

### POST `/download`
Download video with specified resolution.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "resolution": "1080p"
}
```

**Response:**
```json
{
  "success": true,
  "downloadUrl": "/files/Video-Title-1080p.mp4",
  "filename": "Video-Title-1080p.mp4"
}
```

## 🎨 Features in Detail

### Resolution Selection
- Automatically detects all available resolutions
- Filters out audio-only and video-only formats
- Presents user-friendly options (144p, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p)

### Smart URL Parsing
- Extracts video ID from various YouTube URL formats
- Removes playlist and radio parameters automatically
- Ensures clean, single-video downloads

### Error Handling
- Specific error messages for different scenarios:
  - Video unavailable/deleted/private
  - Age-restricted content
  - Network connectivity issues
  - Invalid URLs

### Modern UI/UX
- Glassmorphism design with purple gradient
- Smooth animations (slideUp, fadeIn, spinner)
- Loading states with visual feedback
- Color-coded status messages (info/success/error)

## 🔧 Configuration

### Change Server Port
Edit `server.js`:
```javascript
app.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));
// Change 3000 to your preferred port
```

### Customize Download Location
Edit `server.js`:
```javascript
const filePath = path.join(__dirname, 'downloads', fileName);
// Change 'downloads' to your preferred folder
```

## 🐛 Troubleshooting

### "Video unavailable" error
- Video may be deleted, private, or region-blocked
- Try another video to verify the app is working

### "Cannot connect to YouTube"
- Check your internet connection
- Verify FFmpeg is installed
- Some networks may block YouTube access

### Download stuck or slow
- Large files (4K) take longer to process
- Server is merging video+audio streams
- Check server console for progress logs

### FFmpeg not found
- Ensure FFmpeg is installed and in PATH
- Restart terminal/command prompt after installation
- Test: Run `ffmpeg -version` in terminal

## 📊 Performance Tips

- Lower resolutions (720p, 480p) download faster
- Avoid downloading during peak hours for better speed
- Close browser tabs you don't need to free memory
- Check available disk space before large downloads

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests
- Improve documentation

## 📝 License

This project is licensed under the MIT License - feel free to use it for personal or commercial projects.

## ⚠️ Disclaimer

This tool is for educational purposes only. Please respect YouTube's Terms of Service and copyright laws. Only download videos you have permission to download.

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Awesome YouTube downloader
- [Express.js](https://expressjs.com/) - Fast web framework
- [FFmpeg](https://ffmpeg.org/) - Multimedia processing

## 📧 Support

If you encounter any issues or have questions, please open an issue on the repository.

---

**Made with ❤️ for the community**
