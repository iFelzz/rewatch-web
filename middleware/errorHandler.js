const logger = require('../logger');

const errorHandler = (err, req, res, next) => {
    console.error('❌ Error Handler caught:', err);

    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let userMessage = 'Something went wrong. Please try again.';

    // Known error patterns
    if (err.message && err.message.includes('Video unavailable')) {
        statusCode = 404;
        userMessage = 'Video unavailable. It may be deleted, private, or blocked in your region.';
    } else if (err.message && err.message.includes('Sign in to confirm your age')) {
        statusCode = 403;
        userMessage = 'Video requires age verification. We cannot download this without authentication.';
    } else if (err.code === 'ENOTFOUND') {
        statusCode = 503;
        userMessage = 'Cannot connect to YouTube. Check your internet connection.';
    } else if (err.message && err.message.includes('Invalid URL')) {
        statusCode = 400;
        userMessage = 'Invalid URL. Please enter a valid YouTube URL.';
    }

    // Log the error
    logger.error('Unhandled Error', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });

    res.status(statusCode).json({
        success: false,
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

module.exports = errorHandler;
