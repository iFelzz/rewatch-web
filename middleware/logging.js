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
    let normalizedIp = ip === '::1' || ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip;
    
    // Remove IPv6 prefix if present
    if (normalizedIp && normalizedIp.startsWith('::ffff:')) {
        normalizedIp = normalizedIp.substring(7);
    }
    
    // Check if this is localhost/private IP
    const isLocalhost = normalizedIp === '127.0.0.1' || 
                       normalizedIp === 'localhost' ||
                       normalizedIp?.startsWith('192.168.') ||
                       normalizedIp?.startsWith('10.') ||
                       normalizedIp?.startsWith('172.');
    
    // Lookup geolocation
    const geo = geoip.lookup(normalizedIp);
    
    // Build location object dengan fallback yang lebih informatif
    let locationData;
    
    if (isLocalhost) {
        // Untuk localhost, kasih info yang jelas
        locationData = {
            country: 'Local',
            region: 'Local Network',
            city: 'Local Machine',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
            coordinates: null,
            isLocal: true
        };
    } else if (geo) {
        // Kalau geo data ada, gunakan
        locationData = {
            country: geo.country || 'Unknown',
            region: geo.region || 'Unknown',
            city: geo.city || 'Unknown',
            timezone: geo.timezone || 'Unknown',
            coordinates: geo.ll ? { lat: geo.ll[0], lon: geo.ll[1] } : null,
            isLocal: false
        };
    } else {
        // Kalau geoip-lite gagal detect (database kurang lengkap)
        locationData = {
            country: 'Not Found',
            region: 'Not Found',
            city: 'Not Found',
            timezone: 'Unknown',
            coordinates: null,
            isLocal: false,
            note: 'IP not in geoip-lite database. Try updating: npx geoip-lite-update'
        };
    }
    
    // Attach to request object (semua request butuh ini)
    req.userIp = normalizedIp;
    req.userLocation = locationData;
    
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
            location: locationData,
            userAgent: req.headers['user-agent']
        });
    }
    
    next();
}

module.exports = loggingMiddleware;

