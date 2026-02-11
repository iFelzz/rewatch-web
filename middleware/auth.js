const logger = require('../logger');

/**
 * Helper function untuk mask API key (show first 3 and last 3 chars)
 */
function maskApiKey(key) {
    if (!key) return 'none';
    if (key.length <= 6) return key.substring(0, 3) + '***';
    return key.substring(0, 3) + '***' + key.substring(key.length - 3);
}

/**
 * Middleware untuk authenticate admin requests menggunakan API Key
 */
function authMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const adminApiKey = process.env.ADMIN_API_KEY;
    const startTime = Date.now();
    const isAutoRefresh = req.headers['x-auto-refresh'] === 'true';
    
    // Check if API key is configured
    if (!adminApiKey) {
        logger.error('Admin API key not configured on server', {
            action: 'admin_auth_failed',
            reason: 'Server misconfiguration - no API key set',
            ip: req.userIp,
            location: req.userLocation,
            processingTime: Date.now() - startTime
        });
        
        return res.status(500).json({ 
            error: 'Admin API key not configured on server' 
        });
    }
    
    // Check if API key is provided
    if (!apiKey) {
        logger.warn('Admin authentication failed - No API key provided', {
            action: 'admin_auth_failed',
            reason: 'No API key in request header',
            ip: req.userIp,
            location: req.userLocation,
            processingTime: Date.now() - startTime
        });
        
        return res.status(401).json({ 
            error: 'API key required. Please provide X-API-Key header.' 
        });
    }
    
    // Validate API key
    if (apiKey !== adminApiKey) {
        logger.warn('Admin authentication failed - Invalid API key', {
            action: 'admin_auth_failed',
            reason: 'Invalid API key',
            attemptedKey: maskApiKey(apiKey),
            ip: req.userIp,
            location: req.userLocation,
            userAgent: req.headers['user-agent'],
            processingTime: Date.now() - startTime
        });
        
        return res.status(401).json({ 
            error: 'Invalid API key' 
        });
    }
    
    // API key valid, proceed
    // Only log if NOT auto-refresh (prevent flooding from 10s auto-refresh)
    if (!isAutoRefresh) {
        logger.info('Admin authenticated successfully', {
            action: 'admin_auth_success',
            ip: req.userIp,
            location: req.userLocation,
            userAgent: req.headers['user-agent'],
            processingTime: Date.now() - startTime
        });
    }
    
    next();
}

module.exports = authMiddleware;
