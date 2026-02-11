const geoip = require('geoip-lite');
const logger = require('../logger');

/**
 * Middleware untuk extract IP address dan geolocation data
 * Attach ke req object untuk digunakan di endpoint lain
 */
function loggingMiddleware(req, res, next) {
    // Extract IP address (handle proxy headers)
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
               req.headers['x-real-ip'] ||
               req.socket.remoteAddress ||
               req.connection.remoteAddress;
    
    // Normalize IPv6 localhost to IPv4
    const normalizedIp = ip === '::1' || ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip;
    
    // Lookup geolocation
    const geo = geoip.lookup(normalizedIp) || {};
    
    // Attach to request object (semua request butuh ini)
    req.userIp = normalizedIp;
    req.userLocation = {
        country: geo.country || 'Unknown',
        region: geo.region || 'Unknown',
        city: geo.city || 'Unknown',
        timezone: geo.timezone || 'Unknown',
        coordinates: geo.ll ? { lat: geo.ll[0], lon: geo.ll[1] } : null
    };
    
    // Log HANYA request ke user endpoints (video-info dan download)
    // Jangan log admin routes, static files, atau request lainnya
    const userEndpoints = ['/video-info', '/download'];
    const shouldLog = userEndpoints.includes(req.path);
    
    if (shouldLog) {
        // Determine action based on endpoint
        const action = req.path === '/video-info' ? 'incoming_video_info_request' : 'incoming_download_request';
        
        logger.info('Incoming request', {
            action: action,
            method: req.method,
            path: req.path,
            ip: normalizedIp,
            location: req.userLocation,
            userAgent: req.headers['user-agent']
        });
    }
    
    next();
}

module.exports = loggingMiddleware;
