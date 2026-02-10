// Test script untuk debug yt-dlp
const ytDlp = require('yt-dlp-exec');

const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

console.log('Testing yt-dlp...');
console.log('URL:', testUrl);

ytDlp(testUrl, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot']
})
.then(info => {
    console.log('\n✅ SUCCESS!');
    console.log('Title:', info.title);
    console.log('Duration:', info.duration);
    console.log('Formats count:', info.formats?.length || 0);
    
    const resolutions = new Set();
    info.formats?.forEach(format => {
        if (format.height && format.height >= 144) {
            resolutions.add(format.height);
        }
    });
    
    const availableResolutions = Array.from(resolutions)
        .sort((a, b) => b - a)
        .map(h => `${h}p`);
    
    console.log('Available resolutions:', availableResolutions.join(', '));
})
.catch(error => {
    console.error('\n❌ ERROR!');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
});
