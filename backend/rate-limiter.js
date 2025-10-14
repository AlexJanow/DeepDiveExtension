/**
 * Simple in-memory rate limiter
 * For production with multiple instances, use Redis or a distributed cache
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 10; // 10 requests per window
    this.store = new Map();
    
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }
  
  /**
   * Check if request should be allowed
   * @param {string} identifier - Unique identifier (IP, origin, etc.)
   * @returns {Object} - { allowed: boolean, remaining: number, resetTime: number }
   */
  check(identifier) {
    const now = Date.now();
    const record = this.store.get(identifier);
    
    // No record exists, create new one
    if (!record) {
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }
    
    // Window has expired, reset
    if (now >= record.resetTime) {
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }
    
    // Within window, check if limit exceeded
    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime
      };
    }
    
    // Increment counter
    record.count++;
    this.store.set(identifier, record);
    
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetTime: record.resetTime
    };
  }
  
  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [identifier, record] of this.store.entries()) {
      if (now >= record.resetTime) {
        this.store.delete(identifier);
      }
    }
  }
  
  /**
   * Clear all rate limit records
   */
  reset() {
    this.store.clear();
  }
  
  /**
   * Stop the cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Express middleware factory for rate limiting
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
export function createRateLimitMiddleware(options = {}) {
  const limiter = new RateLimiter(options);
  
  return (req, res, next) => {
    // Use origin as identifier (could also use IP: req.ip)
    const identifier = req.headers.origin || req.ip || 'unknown';
    
    const result = limiter.check(identifier);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests || 10);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);
      
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: retryAfter
      });
    }
    
    next();
  };
}

export default RateLimiter;
