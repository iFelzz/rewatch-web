/**
 * Middleware untuk authenticate admin requests menggunakan API Key
 */
function authMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const adminApiKey = process.env.ADMIN_API_KEY;
    
    // Check if API key is configured
    if (!adminApiKey) {
        return res.status(500).json({ 
            error: 'Admin API key not configured on server' 
        });
    }
    
    // Check if API key is provided
    if (!apiKey) {
        return res.status(401).json({ 
            error: 'API key required. Please provide X-API-Key header.' 
        });
    }
    
    // Validate API key
    if (apiKey !== adminApiKey) {
        return res.status(401).json({ 
            error: 'Invalid API key' 
        });
    }
    
    // API key valid, proceed
    next();
}

module.exports = authMiddleware;
