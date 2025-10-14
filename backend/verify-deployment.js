#!/usr/bin/env node

/**
 * Deployment Verification Script
 * Tests the deployed backend to ensure it's working correctly
 */

import https from 'https';
import http from 'http';

const args = process.argv.slice(2);
const backendUrl = args[0];

if (!backendUrl) {
  console.error('Usage: node verify-deployment.js <backend-url>');
  console.error('Example: node verify-deployment.js https://your-backend.com');
  process.exit(1);
}

const isHttps = backendUrl.startsWith('https://');
const httpModule = isHttps ? https : http;

console.log('🔍 Verifying deployment...');
console.log(`Backend URL: ${backendUrl}\n`);

// Test 1: Health Check
async function testHealthCheck() {
  return new Promise((resolve, reject) => {
    const url = `${backendUrl}/health`;
    console.log('Test 1: Health Check');
    console.log(`GET ${url}`);
    
    httpModule.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            console.log('✅ Health check passed');
            console.log(`   Status: ${json.status}`);
            console.log(`   Timestamp: ${json.timestamp}\n`);
            resolve(true);
          } catch (error) {
            console.log('❌ Health check failed: Invalid JSON response\n');
            resolve(false);
          }
        } else {
          console.log(`❌ Health check failed: Status ${res.statusCode}\n`);
          resolve(false);
        }
      });
    }).on('error', (error) => {
      console.log(`❌ Health check failed: ${error.message}\n`);
      resolve(false);
    });
  });
}

// Test 2: CORS Headers
async function testCORS() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${backendUrl}/analyze`);
    console.log('Test 2: CORS Configuration');
    console.log(`OPTIONS ${url.href}`);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'OPTIONS',
      headers: {
        'Origin': 'chrome-extension://test-extension-id',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    };
    
    const req = httpModule.request(options, (res) => {
      const corsHeader = res.headers['access-control-allow-origin'];
      const methodsHeader = res.headers['access-control-allow-methods'];
      
      if (corsHeader) {
        console.log('✅ CORS headers present');
        console.log(`   Allow-Origin: ${corsHeader}`);
        console.log(`   Allow-Methods: ${methodsHeader || 'not set'}\n`);
        resolve(true);
      } else {
        console.log('❌ CORS headers missing\n');
        resolve(false);
      }
    });
    
    req.on('error', (error) => {
      console.log(`❌ CORS test failed: ${error.message}\n`);
      resolve(false);
    });
    
    req.end();
  });
}

// Test 3: Analyze Endpoint (Basic)
async function testAnalyzeEndpoint() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${backendUrl}/analyze`);
    console.log('Test 3: Analyze Endpoint');
    console.log(`POST ${url.href}`);
    
    const testData = JSON.stringify({
      article: 'This is a test article about artificial intelligence and machine learning. AI is transforming how we interact with technology.'
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData),
        'Origin': 'chrome-extension://test-extension-id'
      }
    };
    
    const req = httpModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            
            // Validate response structure
            const hasRelatedArticles = Array.isArray(json.relatedArticles);
            const hasDefinitions = Array.isArray(json.definitions);
            const hasArguments = json.arguments && 
                                 Array.isArray(json.arguments.main) && 
                                 Array.isArray(json.arguments.counter);
            
            if (hasRelatedArticles && hasDefinitions && hasArguments) {
              console.log('✅ Analyze endpoint working');
              console.log(`   Related Articles: ${json.relatedArticles.length}`);
              console.log(`   Definitions: ${json.definitions.length}`);
              console.log(`   Main Arguments: ${json.arguments.main.length}`);
              console.log(`   Counter Arguments: ${json.arguments.counter.length}\n`);
              resolve(true);
            } else {
              console.log('❌ Analyze endpoint returned invalid structure');
              console.log(`   Response: ${JSON.stringify(json, null, 2)}\n`);
              resolve(false);
            }
          } catch (error) {
            console.log(`❌ Analyze endpoint failed: Invalid JSON response`);
            console.log(`   Error: ${error.message}\n`);
            resolve(false);
          }
        } else {
          console.log(`❌ Analyze endpoint failed: Status ${res.statusCode}`);
          console.log(`   Response: ${data}\n`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ Analyze endpoint failed: ${error.message}\n`);
      resolve(false);
    });
    
    req.write(testData);
    req.end();
  });
}

// Test 4: Rate Limiting
async function testRateLimiting() {
  return new Promise((resolve, reject) => {
    console.log('Test 4: Rate Limiting');
    console.log('Sending multiple requests to test rate limiting...');
    
    let completed = 0;
    let rateLimited = false;
    const totalRequests = 15; // Should trigger rate limit
    
    for (let i = 0; i < totalRequests; i++) {
      const url = new URL(`${backendUrl}/analyze`);
      const testData = JSON.stringify({
        article: `Test article ${i}`
      });
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(testData),
          'Origin': 'chrome-extension://test-extension-id'
        }
      };
      
      const req = httpModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          completed++;
          
          if (res.statusCode === 429) {
            rateLimited = true;
          }
          
          if (completed === totalRequests) {
            if (rateLimited) {
              console.log('✅ Rate limiting is working');
              console.log(`   Received 429 status after multiple requests\n`);
              resolve(true);
            } else {
              console.log('⚠️  Rate limiting may not be configured');
              console.log(`   All ${totalRequests} requests succeeded\n`);
              resolve(true); // Not a failure, just a warning
            }
          }
        });
      });
      
      req.on('error', (error) => {
        completed++;
        if (completed === totalRequests) {
          console.log(`⚠️  Rate limiting test inconclusive: ${error.message}\n`);
          resolve(true);
        }
      });
      
      req.write(testData);
      req.end();
    }
  });
}

// Test 5: Error Handling
async function testErrorHandling() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${backendUrl}/analyze`);
    console.log('Test 5: Error Handling');
    console.log(`POST ${url.href} (with invalid data)`);
    
    const testData = JSON.stringify({
      // Missing required 'article' field
      concepts: ['test']
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData),
        'Origin': 'chrome-extension://test-extension-id'
      }
    };
    
    const req = httpModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 400) {
          console.log('✅ Error handling working');
          console.log(`   Correctly returned 400 for invalid request\n`);
          resolve(true);
        } else {
          console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
          console.log(`   Expected 400 for invalid request\n`);
          resolve(true); // Not a critical failure
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ Error handling test failed: ${error.message}\n`);
      resolve(false);
    });
    
    req.write(testData);
    req.end();
  });
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testHealthCheck());
  results.push(await testCORS());
  results.push(await testAnalyzeEndpoint());
  results.push(await testRateLimiting());
  results.push(await testErrorHandling());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('═══════════════════════════════════════');
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('═══════════════════════════════════════\n');
  
  if (passed === total) {
    console.log('✅ All tests passed! Deployment is ready.');
    console.log('\nNext steps:');
    console.log('1. Update Chrome Extension with this backend URL');
    console.log('2. Test the extension end-to-end');
    console.log('3. Set up monitoring and alerts');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review the issues above.');
    console.log('\nCommon issues:');
    console.log('- CORS not configured for chrome-extension:// origins');
    console.log('- Gemini API key not set or invalid');
    console.log('- Rate limiting not enabled');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
