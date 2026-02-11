// Simple test script untuk test logging functionality
const http = require('http');

console.log('Testing logging system...\n');

// Test 1: Fetch video info
console.log('Test 1: Fetching video info for YouTube Shorts...');
const videoInfoData = JSON.stringify({
    url: 'https://www.youtube.com/shorts/cDtIYbJjyPM'
});

const videoInfoOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/video-info',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': videoInfoData.length
    }
};

const req1 = http.request(videoInfoOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('✅ Video info response:', JSON.parse(data).title || 'Success');
        
        // Wait a bit then test admin endpoint
        setTimeout(testAdminEndpoint, 1000);
    });
});

req1.on('error', (error) => {
    console.error('❌ Error:', error.message);
});

req1.write(videoInfoData);
req1.end();

// Test 2: Admin endpoint
function testAdminEndpoint() {
    console.log('\nTest 2: Testing admin endpoint...');
    
    const adminOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/admin/logs',
        method: 'GET',
        headers: {
            'X-API-Key': '2909cfa01b2f151703f1de4fe1ec6e36dbafa25905f85cefe21'
        }
    };
    
    const req2 = http.request(adminOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            const result = JSON.parse(data);
            console.log('✅ Admin endpoint response:', result.logs.length, 'log file(s) found');
            
            // Test viewing today's logs
            if (result.logs.length > 0) {
                setTimeout(() => testViewLogs(result.logs[0].date), 1000);
            }
        });
    });
    
    req2.on('error', (error) => {
        console.error('❌ Error:', error.message);
    });
    
    req2.end();
}

// Test 3: View specific log file
function testViewLogs(date) {
    console.log(`\nTest 3: Viewing logs for ${date}...`);
    
    const viewLogsOptions = {
        hostname: 'localhost',
        port: 3000,
        path: `/admin/logs/${date}`,
        method: 'GET',
        headers: {
            'X-API-Key': '2909cfa01b2f151703f1de4fe1ec6e36dbafa25905f85cefe21'
        }
    };
    
    const req3 = http.request(viewLogsOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            const result = JSON.parse(data);
            console.log('✅ Logs retrieved:', result.count, 'entries');
            console.log('\nSample log entry:');
            if (result.logs.length > 0) {
                const log = result.logs[result.logs.length - 1];
                console.log(JSON.stringify(log, null, 2));
            }
            console.log('\n✅ All tests completed successfully!');
        });
    });
    
    req3.on('error', (error) => {
        console.error('❌ Error:', error.message);
    });
    
    req3.end();
}
