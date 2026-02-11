const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Define log directory
const logDir = path.join(__dirname, 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Create daily rotate file transport for access logs
const dailyRotateFileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d', // Keep logs for 30 days
    format: logFormat,
    level: 'info',
    createSymlink: false,
    // This ensures new files are created even after deletion
    options: { flags: 'a' }
});

// Create winston logger
const logger = winston.createLogger({
    format: logFormat,
    transports: [
        dailyRotateFileTransport,
        // Console transport for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
        })
    ],
    // Handle errors gracefully
    exitOnError: false
});

// Log when rotation happens
dailyRotateFileTransport.on('rotate', (oldFilename, newFilename) => {
    logger.info('Log file rotated', { oldFilename, newFilename });
});

// Handle errors
dailyRotateFileTransport.on('error', (error) => {
    console.error('Logger transport error:', error);
});

module.exports = logger;
