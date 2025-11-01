// Simple test script for the /analyze endpoint
// Run this after starting the server with: node test-endpoint.js

const BASE_URL = 'http://localhost:3001';

async function testEndpoint(testName, requestBody, expectedStatus) {
  console.log(`\n🧪 Testing: ${testName}`);
  
  try {
    const response = await fetch(`${BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    const status = response.status;
    
    if (status === expectedStatus) {
      console.log(`✅ PASS - Status: ${status}`);
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log(`❌ FAIL - Expected ${expectedStatus}, got ${status}`);
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log(`❌ ERROR - ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 Starting endpoint tests...');
  console.log(`Testing server at: ${BASE_URL}`);
  
  // Test 1: Valid request
  await testEndpoint(
    'Valid request with article text',
    { article: 'This is a test article about AI and machine learning.' },
    200
  );
  
  // Test 2: Valid request with concepts
  await testEndpoint(
    'Valid request with article and concepts',
    { 
      article: 'This is a test article about AI and machine learning.',
      concepts: ['AI', 'machine learning']
    },
    200
  );
  
  // Test 3: Missing article
  await testEndpoint(
    'Missing article field',
    { concepts: ['test'] },
    400
  );
  
  // Test 4: Empty article
  await testEndpoint(
    'Empty article text',
    { article: '' },
    400
  );
  
  // Test 5: Invalid article type
  await testEndpoint(
    'Invalid article type (number)',
    { article: 123 },
    400
  );
  
  // Test 6: Invalid concepts type
  await testEndpoint(
    'Invalid concepts type (string)',
    { article: 'Test article', concepts: 'not an array' },
    400
  );
  
  // Test 7: Too many concepts
  await testEndpoint(
    'Too many concepts (>20)',
    { 
      article: 'Test article',
      concepts: Array(25).fill('concept')
    },
    400
  );
  
  // Test 8: Very long article
  await testEndpoint(
    'Very long article (>500k chars)',
    { article: 'a'.repeat(500001) },
    400
  );
  
  // Test 9: Health check
  console.log('\n🧪 Testing: Health check endpoint');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ PASS - Health check:', data);
  } catch (error) {
    console.log(`❌ ERROR - ${error.message}`);
  }
  
  console.log('\n✨ Tests completed!');
}

// Check if server is running
fetch(`${BASE_URL}/health`)
  .then(() => runTests())
  .catch(() => {
    console.error('❌ Server is not running at', BASE_URL);
    console.error('Please start the server first with: npm start');
    process.exit(1);
  });
