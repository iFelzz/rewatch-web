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

/**
 * Force recreate log file after deletion
 * This manually creates the log file and writes initial entry
 */
logger.forceRecreateFile = function() {
    try {
        // Get today's date in the format winston uses
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const logFilePath = path.join(logDir, `access-${dateStr}.log`);
        
        // Create the log entry
        const logEntry = {
            level: 'info',
            message: 'Log file recreated after deletion',
            action: 'system_log_file_recreated',
            timestamp: today.toISOString().replace('T', ' ').substring(0, 19)
        };
        
        // Manually write to file using fs to force creation
        // Winston will then pick up this file on next write
        fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n', 'utf8');
        
        console.log(`✅ Log file recreated: ${logFilePath}`);
    } catch (error) {
        console.error('Failed to recreate log file:', error);
    }
};

module.exports = logger;
