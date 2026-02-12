require('dotenv').config();
const express = require('express');
const compression = require('compression');
const loggingMiddleware = require('./middleware/logging');
const errorHandler = require('./middleware/errorHandler');

// Routes
const infoRoutes = require('./routes/info');
const downloadRoutes = require('./routes/download');
const adminRoutes = require('./routes/admin');
const { downloadQueue } = require('./middleware/download-queue');

const app = express();

// Global Middleware
app.use(express.json());
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        if (req.path.includes('/api/progress')) return false; // Important for SSE
        return compression.filter(req, res);
    }
}));
app.use(express.static('public'));
app.use(loggingMiddleware);

// API Routes
app.use('/api', infoRoutes);
app.use('/api', downloadRoutes); // Includes /info, /download, /batch, /progress
app.use('/admin', adminRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        uptime: process.uptime(),
        queue: downloadQueue.getStatus()
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
