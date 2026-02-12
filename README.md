# Re-Watch 🎬

**Download YouTube videos to watch again, anytime.**

A modern, web-based YouTube video downloader with customizable resolution selection. Built with Node.js and Express, featuring a beautiful glassmorphism UI design and real-time progress tracking.

![Re-Watch](https://img.shields.io/badge/Re--Watch-2.0-blueviolet?style=for-the-badge&logo=youtube)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

## ✨ New in Version 2.0

- 🚀 **Real-Time Progress Bar**: See exact download percentage and status updates live from the server.
- 📂 **Portable Architecture**: **No need to install FFmpeg globally!** The app now includes a standalone FFmpeg binary, making it truly plug-and-play.
- 📦 **Batch Downloading**: Download multiple videos at once with a "1/N" progress indicator.
- 🎵 **MP3 Support**: Extract high-quality audio from videos, even in batch mode.
- 🌙 **Dark Mode**: Toggle between light and dark themes with a beautiful animated sun/moon switch.

## 🚀 Features

- 🎯 **Multiple Resolution Options** - Choose from 144p to 4K quality.
- 📝 **Smart Filename** - Files saved with original video title.
- 🎨 **Modern UI** - Beautiful glassmorphism design with smooth animations and the 'Outfit' aesthetic font.
- 🖼️ **Video Preview** - Thumbnail and duration display before download.
- ⚡ **Fast & Efficient** - Powered by `yt-dlp` with automatic video+audio merging.
- 📱 **Responsive Design** - Works perfectly on desktop, tablet, and mobile devices.

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
   *This will automatically install `ffmpeg-static` and other required packages.*

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
   - Paste any YouTube video URL (supports playlist/radio URLs too).
2. **Fetch Video Info**
   - Click "📋 Fetch Info" to see video details.
3. **Select Format & Quality**
   - Choose **MP4**, **WebM**, or **MP3 (Audio Only)**.
   - Select your preferred resolution (up to 4K).
4. **Download**
   - Click "⬇️ Download Video".
   - Watch the **real-time progress bar** as the server processes the file.
   - Once processed, you'll see a "Saving to device..." status as the file transfers to your computer.

## 📊 Logging System (Admin)

Re-Watch tracks activities for analytics (stored locally in `logs/`).

- **Access**: `http://localhost:3000/admin.html`
- **Setup**: Copy `.env.example` to `.env` and set a secure `ADMIN_API_KEY`.
- **Features**: View daily access logs, download stats, and error reports.

## 📁 Project Structure

```
Re-Watch/
├── public/                 # Frontend (HTML, CSS, JS)
├── temp/                   # Temporary processing files (auto-cleanup)
├── logs/                   # Access and error logs
├── middleware/             # Express middlewares (Auth, Rate Limit, Validation)
├── server.js              # Main application server
└── package.json           # Dependencies
```

## 🤝 Contributing

Contributions are welcome! Feel free to report bugs or suggest new features.

## 📝 License

This project is licensed under the MIT License.

---

**Made with ❤️ for the community**
