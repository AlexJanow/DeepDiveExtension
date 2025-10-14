/**
 * Unit tests for rate limiter
 */

import RateLimiter from './rate-limiter.js';

console.log('Testing Rate Limiter...\n');

// Test 1: Basic functionality
console.log('Test 1: Basic rate limiting');
const limiter1 = new RateLimiter({ windowMs: 60000, maxRequests: 5 });

for (let i = 1; i <= 7; i++) {
  const result = limiter1.check('test-user');
  console.log(`Request ${i}: ${result.allowed ? '✅ Allowed' : '❌ Blocked'} (remaining: ${result.remaining})`);
}

limiter1.destroy();
console.log('');

// Test 2: Window expiration
console.log('Test 2: Window expiration');
const limiter2 = new RateLimiter({ windowMs: 1000, maxRequests: 3 });

console.log('Making 3 requests...');
for (let i = 1; i <= 3; i++) {
  const result = limiter2.check('test-user-2');
  console.log(`Request ${i}: ${result.allowed ? '✅ Allowed' : '❌ Blocked'}`);
}

console.log('Request 4 (should be blocked):');
const result4 = limiter2.check('test-user-2');
console.log(`Request 4: ${result4.allowed ? '✅ Allowed' : '❌ Blocked'}`);

console.log('Waiting 1.1 seconds for window to expire...');
await new Promise(resolve => setTimeout(resolve, 1100));

console.log('Request 5 (after window expiration, should be allowed):');
const result5 = limiter2.check('test-user-2');
console.log(`Request 5: ${result5.allowed ? '✅ Allowed' : '❌ Blocked'}`);

limiter2.destroy();
console.log('');

// Test 3: Multiple users
console.log('Test 3: Multiple users (separate limits)');
const limiter3 = new RateLimiter({ windowMs: 60000, maxRequests: 2 });

const user1Result1 = limiter3.check('user-1');
const user1Result2 = limiter3.check('user-1');
const user1Result3 = limiter3.check('user-1');

const user2Result1 = limiter3.check('user-2');
const user2Result2 = limiter3.check('user-2');

console.log(`User 1 - Request 1: ${user1Result1.allowed ? '✅ Allowed' : '❌ Blocked'}`);
console.log(`User 1 - Request 2: ${user1Result2.allowed ? '✅ Allowed' : '❌ Blocked'}`);
console.log(`User 1 - Request 3: ${user1Result3.allowed ? '✅ Allowed' : '❌ Blocked'} (should be blocked)`);
console.log(`User 2 - Request 1: ${user2Result1.allowed ? '✅ Allowed' : '❌ Blocked'}`);
console.log(`User 2 - Request 2: ${user2Result2.allowed ? '✅ Allowed' : '❌ Blocked'}`);

limiter3.destroy();
console.log('');

// Test 4: Reset functionality
console.log('Test 4: Reset functionality');
const limiter4 = new RateLimiter({ windowMs: 60000, maxRequests: 2 });

limiter4.check('test-user-4');
limiter4.check('test-user-4');
const beforeReset = limiter4.check('test-user-4');
console.log(`Before reset: ${beforeReset.allowed ? '✅ Allowed' : '❌ Blocked'} (should be blocked)`);

limiter4.reset();
const afterReset = limiter4.check('test-user-4');
console.log(`After reset: ${afterReset.allowed ? '✅ Allowed' : '❌ Blocked'} (should be allowed)`);

limiter4.destroy();
console.log('');

// Test 5: Cleanup
console.log('Test 5: Cleanup of expired entries');
const limiter5 = new RateLimiter({ windowMs: 500, maxRequests: 5 });

limiter5.check('user-a');
limiter5.check('user-b');
limiter5.check('user-c');

console.log(`Store size before cleanup: ${limiter5.store.size}`);

await new Promise(resolve => setTimeout(resolve, 600));
limiter5.cleanup();

console.log(`Store size after cleanup: ${limiter5.store.size} (should be 0)`);

limiter5.destroy();
console.log('');

console.log('✅ All rate limiter tests completed!');
