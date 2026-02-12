const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { adminRateLimiter } = require('../middleware/rate-limit');
const authMiddleware = require('../middleware/auth');
const logger = require('../logger');

// Apply auth and rate limit to all admin routes
router.use(adminRateLimiter, authMiddleware);

router.get('/logs', (req, res, next) => {
    try {
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) {
            return res.json({ success: true, logs: [], message: 'No logs found.' });
        }

        const files = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log'))
            .map(file => {
                const stats = fs.statSync(path.join(logsDir, file));
                return {
                    filename: file,
                    date: file.replace('access-', '').replace('.log', ''),
                    size: `${(stats.size / 1024).toFixed(2)} KB`,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({ success: true, logs: files });
    } catch (error) {
        next(error);
    }
});

router.get('/logs/:date', (req, res, next) => {
    try {
        const { date } = req.params;
        const logsDir = path.join(__dirname, '..', 'logs');
        const logFile = path.join(logsDir, `access-${date}.log`);

        if (!fs.existsSync(logFile)) {
            return res.status(404).json({ error: 'Log file not found' });
        }

        const content = fs.readFileSync(logFile, 'utf-8');
        const logs = content.split('\n')
            .filter(l => l.trim())
            .map(line => {
                try { return JSON.parse(line); } 
                catch (e) { return { raw: line }; }
            });

        res.json({ success: true, date, logs, count: logs.length });
    } catch (error) {
        next(error);
    }
});

router.delete('/logs/:date', (req, res, next) => {
    try {
        const { date } = req.params;
        const logsDir = path.join(__dirname, '..', 'logs');

        if (date === 'all') {
            const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
            files.forEach(f => fs.writeFileSync(path.join(logsDir, f), ''));
            return res.json({ success: true, message: 'All logs cleared' });
        }

        const logFile = path.join(logsDir, `access-${date}.log`);
        if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '');
            res.json({ success: true, message: 'Log cleared' });
        } else {
            res.status(404).json({ error: 'Log file not found' });
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;
