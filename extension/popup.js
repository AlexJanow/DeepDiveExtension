// DeepDive Assistant - Popup Script

/**
 * CacheManager handles caching of summaries and analyses
 * Uses chrome.storage.local with TTL support and content fingerprinting
 */
class CacheManager {
  constructor() {
    this.storage = chrome.storage.local;
  }
  
  /**
   * Generate a unique cache key from URL and content hash
   * @param {string} url - Page URL
   * @param {string} text - Article text content
   * @returns {Promise<string>} Cache key in format "url:hash"
   */
  async generateCacheKey(url, text) {
    // Create hash of first 1000 chars for content fingerprint
    const contentSample = text.substring(0, 1000);
    const hash = await this.simpleHash(contentSample);
    return `${url}:${hash}`;
  }
  
  /**
   * Generate SHA-256 hash of string (truncated to 16 chars)
   * @param {string} str - String to hash
   * @returns {Promise<string>} Hex hash string
   */
  async simpleHash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16);
  }
  
  /**
   * Retrieve cached value by key
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Cache entry or null if not found
   */
  async get(key) {
    const result = await this.storage.get(key);
    return result[key] || null;
  }
  
  /**
   * Store value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time-to-live in milliseconds (default: 24 hours)
   * @returns {Promise<void>}
   */
  async set(key, value, ttl = 86400000) {
    const entry = {
      value,
      timestamp: Date.now(),
      ttl
    };
    await this.storage.set({ [key]: entry });
  }
  
  /**
   * Check if cached entry is still valid (not expired)
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if valid, false if expired or not found
   */
  async isValid(key) {
    const entry = await this.get(key);
    if (!entry) return false;
    return (Date.now() - entry.timestamp) < entry.ttl;
  }
}

/**
 * SettingsManager handles user preferences
 */
class SettingsManager {
  constructor() {
    this.storage = chrome.storage.sync;
    this.defaults = {
      queryGenerationMode: 'immediate' // 'immediate' or 'on-demand'
    };
  }
  
  async get(key) {
    const result = await this.storage.get(key);
    return result[key] ?? this.defaults[key];
  }
  
  async set(key, value) {
    await this.storage.set({ [key]: value });
  }
  
  async getAll() {
    const result = await this.storage.get(null);
    return { ...this.defaults, ...result };
  }
}

/**
 * SummarizerService handles Chrome's built-in Summarizer API
 * Must run in popup context (top-level window), not service worker
 */
class SummarizerService {
  constructor(options = {}) {
    this.summarizer = null;
    this.options = {
      // For concise results, default to a single-sentence TL;DR
      type: options.type || 'tldr',
      format: options.format || 'markdown',
      length: options.length || 'short'
    };
  }
  
  /**
   * Check if Summarizer API is available
   * @returns {Promise<Object>} Object with available flag and reason
   */
  async checkAvailability() {
    // Check if API exists in global context
    if (!('Summarizer' in self)) {
      return { 
        available: false, 
        reason: 'API not found. Please use Chrome Canary/Beta with AI features enabled.' 
      };
    }
    
    try {
      const availability = await Summarizer.availability();
      
      // Handle availability states: 'available', 'downloadable', 'downloading', 'unavailable'
      return {
        available: availability !== 'unavailable',
        reason: availability,
        needsDownload: availability === 'downloadable'
      };
    } catch (error) {
      return {
        available: false,
        reason: `Error checking availability: ${error.message}`
      };
    }
  }
  
  /**
   * Verify user activation (required for API usage)
   * @returns {boolean} True if user activation is active
   */
  checkUserActivation() {
    return navigator.userActivation?.isActive || false;
  }
  
  /**
   * Truncate text to a safe character limit with sentence boundaries
   * @param {string} text - Original text
   * @param {number} maxChars - Maximum characters allowed (default: 10000)
   * @returns {string} Truncated text
   */
  truncateToLimit(text, maxChars = 10000) {
    // If text is within limit, return as-is
    if (text.length <= maxChars) {
      return text;
    }
    
    // Find the last sentence boundary before max length
    const truncated = text.substring(0, maxChars);
    const sentenceEndings = /[.!?]\s/g;
    let lastMatch = null;
    let match;
    
    while ((match = sentenceEndings.exec(truncated)) !== null) {
      lastMatch = match;
    }
    
    if (lastMatch) {
      // Return text up to and including the sentence ending
      return text.substring(0, lastMatch.index + 1).trim();
    }
    
    // Fallback: truncate at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? text.substring(0, lastSpace).trim() : truncated.trim();
  }
  
  /**
   * Initialize summarizer instance with download progress monitoring
   * @param {Function} onProgress - Optional callback for download progress (percent)
   * @returns {Promise<Object>} Summarizer instance
   */
  async initialize(onProgress = null) {
    // If already initialized, return existing instance without re-initializing
    if (this.summarizer) {
      return this.summarizer;
    }
    
    try {
      const createOptions = {
        ...this.options,
        sharedContext: 'This is a web article or blog post intended for general readers.',
        outputLanguage: 'en'
      };
      
      // Only add monitor if progress callback provided AND model not yet initialized
      if (onProgress && !this.summarizer) {
        createOptions.monitor = (m) => {
          m.addEventListener('downloadprogress', (e) => {
            const percent = Math.round(e.loaded * 100);
            onProgress(percent);
          });
        };
      }
      
      this.summarizer = await Summarizer.create(createOptions);
      return this.summarizer;
    } catch (error) {
      throw new Error(`Failed to initialize summarizer: ${error.message}`);
    }
  }
  
  /**
   * Generate summary of text
   * @param {string} text - Text to summarize
   * @param {string} context - Optional context for summarization
   * @param {Function} onProgress - Optional callback for download progress
   * @returns {Promise<string>} Generated summary
   */
  async summarize(text, context = '', onProgress = null) {
    // Initialize if needed (with download progress callback)
    await this.initialize(onProgress);
    
    // Truncate text to safe character limit (10,000 chars)
    const textToSummarize = this.truncateToLimit(text, 10000);
    
    if (textToSummarize.length < text.length) {
      console.warn(`Text truncated from ${text.length} to ${textToSummarize.length} characters`);
    }
    
    try {
      // Generate summary with optional context and explicit output language
      const summary = await this.summarizer.summarize(textToSummarize, {
        context: context || 'Web article',
        // Setting outputLanguage per request silences API warning and improves quality
        outputLanguage: 'en'
      });
      
      return summary;
    } catch (error) {
      throw new Error(`Summarization failed: ${error.message}`);
    }
  }
  
  /**
   * Clean up and destroy summarizer instance
   */
  destroy() {
    if (this.summarizer) {
      try {
        this.summarizer.destroy();
      } catch (error) {
        console.error('Error destroying summarizer:', error);
      }
      this.summarizer = null;
    }
  }
}

/**
 * ErrorHandler provides user-friendly error messages and handling
 */
class ErrorHandler {
  static errorMap = {
    'QuotaExceededError': {
      message: 'Article is too long for instant summary. Try selecting a shorter section.',
      action: 'truncate',
      recoverable: false
    },
    'NetworkError': {
      message: 'Unable to connect to analysis service. Please check your internet connection.',
      action: 'retry',
      recoverable: true
    },
    'TimeoutError': {
      message: 'Request timed out. The server took too long to respond.',
      action: 'retry',
      recoverable: true
    },
    'ConnectionRefusedError': {
      message: 'Connection refused. The analysis service may be temporarily unavailable.',
      action: 'retry',
      recoverable: true
    },
    'ServerError': {
      message: 'Server error occurred. Please try again later.',
      action: 'retry',
      recoverable: true
    },
    'RateLimitError': {
      message: 'Rate limit exceeded. Please wait a moment and try again.',
      action: 'retry',
      recoverable: true
    },
    'TypeError': {
      message: 'An unexpected error occurred. Please try again.',
      action: 'reload',
      recoverable: false
    },
    'NoContentError': {
      message: 'No article content found on this page. Try navigating to a regular website (news article, blog post, or documentation site) to use this feature.',
      action: 'none',
      recoverable: false
    },
    'APIUnavailableError': {
      message: 'Summarizer API is not available. Please use Chrome Canary/Beta with AI features enabled.',
      action: 'none',
      recoverable: false
    },
    'UserActivationError': {
      message: 'Please click the button again to activate the summarizer.',
      action: 'retry',
      recoverable: true
    },
    'UnsupportedContextError': {
      message: 'Summarizer API must be called from the popup window. Please try again.',
      action: 'reload',
      recoverable: false
    }
  };
  
  /**
   * Handle error and return user-friendly information
   * @param {Error} error - Error object
   * @param {string} context - Context where error occurred
   * @returns {Object} Error info with message, action, and recoverable flag
   */
  static handle(error, context) {
    // Log detailed error information for debugging
    console.error(`Error in ${context}:`, error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      context: context
    });
    
    // Check for specific network error patterns
    let errorInfo = this.errorMap[error.name];
    
    if (!errorInfo) {
      // Try to identify network error types from message
      if (error.message.includes('timeout') || error.message.includes('timed out')) {
        errorInfo = this.errorMap['TimeoutError'];
      } else if (error.message.includes('refused') || error.message.includes('ECONNREFUSED')) {
        errorInfo = this.errorMap['ConnectionRefusedError'];
      } else if (error.message.includes('rate limit') || error.message.includes('429')) {
        errorInfo = this.errorMap['RateLimitError'];
      } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
        errorInfo = this.errorMap['ServerError'];
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorInfo = this.errorMap['NetworkError'];
      } else {
        // Default fallback
        errorInfo = {
          message: error.message || 'An unknown error occurred. Please try again.',
          action: 'none',
          recoverable: false
        };
      }
    }
    
    return {
      ...errorInfo,
      originalError: error
    };
  }
  
  /**
   * Display error message in UI with optional retry button
   * @param {string} message - Error message to display
   * @param {HTMLElement} errorElement - Error display element
   * @param {HTMLElement} outputElement - Output element to hide
   * @param {Object} options - Display options
   * @param {boolean} options.showRetry - Whether to show retry button
   * @param {Function} options.onRetry - Callback for retry button click
   */
  static displayError(message, errorElement, outputElement, options = {}) {
    if (outputElement) {
      outputElement.hidden = true;
      outputElement.innerHTML = '';
    }
    
    if (errorElement) {
      // Clear any existing content
      errorElement.innerHTML = '';
      
      // Create error message element
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      errorElement.appendChild(messageEl);
      
      // Add retry button if requested
      if (options.showRetry && options.onRetry) {
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '🔄 Retry';
        retryBtn.className = 'retry-btn';
        retryBtn.addEventListener('click', options.onRetry);
        errorElement.appendChild(retryBtn);
      }
      
      errorElement.hidden = false;
    }
  }
  
  /**
   * Clear error display
   * @param {HTMLElement} errorElement - Error display element
   */
  static clearError(errorElement) {
    if (errorElement) {
      errorElement.innerHTML = '';
      errorElement.hidden = true;
    }
  }
  
  /**
   * Create a retry wrapper for async functions
   * @param {Function} fn - Async function to retry
   * @param {number} maxRetries - Maximum number of retry attempts
   * @param {number} delay - Delay between retries in milliseconds
   * @returns {Function} Wrapped function with retry logic
   */
  static withRetry(fn, maxRetries = 3, delay = 1000) {
    return async function(...args) {
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn.apply(this, args);
        } catch (error) {
          lastError = error;
          
          // Check if error is recoverable
          const errorInfo = ErrorHandler.handle(error, 'retry');
          
          if (!errorInfo.recoverable || attempt === maxRetries) {
            throw error;
          }
          
          // Log retry attempt
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Exponential backoff
          delay *= 2;
        }
      }
      
      throw lastError;
    };
  }
}

/**
 * DeepDiveAssistant - Main application class
 * Coordinates UI, content extraction, summarization, and analysis
 */
class DeepDiveAssistant {
  constructor() {
    console.log('DeepDiveAssistant constructor called');
    
    try {
      this.cache = new CacheManager();
      this.settings = new SettingsManager();
      this.summarizerService = new SummarizerService();
      console.log('Services initialized');
      
      // UI elements
      console.log('Looking for UI elements...');
      this.summarizeBtn = document.getElementById('summarizeBtn');
      this.analyzeBtn = document.getElementById('analyzeBtn');
      this.immediateQueryGenCheckbox = document.getElementById('immediateQueryGen');
      this.spinner = document.getElementById('spinner');
      this.output = document.getElementById('output');
      this.error = document.getElementById('error');
      
      // State
      this.isProcessing = false;
      this.preGeneratedSearchQuery = null;
      this.isGeneratingQuery = false; // Track if query generation is in progress
      this.renderState = {
        headerRendered: false,
        articlesRendered: false,
        analysisRendered: false
      };
      
      // Bind methods
      this.handleInstantSummary = this.handleInstantSummary.bind(this);
      this.handleDeepDiveAnalysis = this.handleDeepDiveAnalysis.bind(this);
      this.handleSettingsChange = this.handleSettingsChange.bind(this);
      console.log('Methods bound');
      
      // Initialize
      this.init();
    } catch (error) {
      console.error('ERROR in DeepDiveAssistant constructor:', error);
      console.error('Error stack:', error.stack);
    }
  }
  
  /**
   * Initialize event listeners and settings
   */
  async init() {
    console.log('Initializing DeepDive Assistant...');
    console.log('UI Elements:', {
      summarizeBtn: this.summarizeBtn ? 'found' : 'MISSING',
      analyzeBtn: this.analyzeBtn ? 'found' : 'MISSING',
      immediateQueryGenCheckbox: this.immediateQueryGenCheckbox ? 'found' : 'MISSING',
      spinner: this.spinner ? 'found' : 'MISSING',
      output: this.output ? 'found' : 'MISSING',
      error: this.error ? 'found' : 'MISSING'
    });
    
    if (!this.summarizeBtn || !this.analyzeBtn || !this.immediateQueryGenCheckbox) {
      console.error('ERROR: Required UI elements not found!');
      return;
    }
    
    // Load settings
    const mode = await this.settings.get('queryGenerationMode');
    this.immediateQueryGenCheckbox.checked = (mode === 'immediate');
    
    // Attach event listeners
    this.summarizeBtn.addEventListener('click', this.handleInstantSummary);
    this.analyzeBtn.addEventListener('click', this.handleDeepDiveAnalysis);
    this.immediateQueryGenCheckbox.addEventListener('change', this.handleSettingsChange);
    console.log('Event listeners attached successfully');
    
    // Pre-generate search query if immediate mode is enabled
    if (mode === 'immediate') {
      this.preGenerateSearchQuery();
    }
  }
  
  /**
   * Handle settings checkbox change
   */
  async handleSettingsChange() {
    const isImmediate = this.immediateQueryGenCheckbox.checked;
    const mode = isImmediate ? 'immediate' : 'on-demand';
    await this.settings.set('queryGenerationMode', mode);
    console.log(`Query generation mode changed to: ${mode}`);
    
    // If switching to immediate mode and no query exists, generate now
    if (isImmediate && !this.preGeneratedSearchQuery && !this.isGeneratingQuery) {
      this.preGenerateSearchQuery();
    }
  }
  
  /**
   * Pre-generate search query when popup opens for faster Deep Dive Analysis
   */
  async preGenerateSearchQuery() {
    if (this.isGeneratingQuery) {
      console.log('Query generation already in progress, skipping...');
      return;
    }
    
    try {
      this.isGeneratingQuery = true;
      console.log('Pre-generating search query...');
      
      // Get page text + meta
      const page = await this.getPageText();
      
      // Generate search query using local Summarizer API
      const searchQuery = await this.generateSearchQuery(page.text, { title: page.title, heading: page.heading });
      
      if (searchQuery) {
        this.preGeneratedSearchQuery = searchQuery;
        console.log('Pre-generated search query:', searchQuery);
      } else {
        console.log('No search query generated, will use fallback approach');
      }
      
    } catch (error) {
      console.warn('Failed to pre-generate search query:', error.message);
      // Continue without pre-generated query - fallback will be used
    } finally {
      this.isGeneratingQuery = false;
    }
  }
  
  /**
   * Get page text from content script
   * @returns {Promise<Object>} Object with text and url properties
   */
  async getPageText() {
    console.log('getPageText() called');
    return new Promise((resolve, reject) => {
      // Get active tab
      console.log('Querying active tab...');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          console.error('No active tab found');
          reject(new Error('No active tab found'));
          return;
        }
        
        const activeTab = tabs[0];
        console.log('Active tab:', activeTab.id, activeTab.url);
        
        // Check if we're on a restricted page where content scripts can't run
        const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'moz-extension:', 'safari-extension:'];
        const isRestrictedPage = restrictedProtocols.some(protocol => activeTab.url.startsWith(protocol));
        
        if (isRestrictedPage) {
          console.error('Extension cannot run on restricted page:', activeTab.url);
          const error = new Error('This extension cannot analyze Chrome internal pages or extension pages. Please navigate to a regular website (like a news article, blog post, or documentation site) to use this feature.');
          error.name = 'NoContentError';
          reject(error);
          return;
        }
        // Send message to content script
        console.log('Sending GET_TEXT message to content script...');
        chrome.tabs.sendMessage(
          activeTab.id,
          { type: 'GET_TEXT' },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Chrome runtime error:', chrome.runtime.lastError);
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            
            console.log('Received response from content script:', response ? 'valid' : 'null');
            
            if (!response || !response.text) {
              console.error('No text in response');
              const error = new Error('No article content found on this page.');
              error.name = 'NoContentError';
              reject(error);
              return;
            }
            
            // Validate minimum text length
            if (response.text.trim().length < 100) {
              console.error('Text too short:', response.text.trim().length, 'characters');
              const error = new Error('Article content is too short to analyze.');
              error.name = 'NoContentError';
              reject(error);
              return;
            }
            
            console.log('Page text validation passed');
            resolve(response);
          }
        );
      });
    });
  }
  
  /**
   * Show loading spinner and disable buttons
   */
  showLoading() {
    this.isProcessing = true;
    this.spinner.hidden = false;
    this.output.hidden = true;
    this.error.hidden = true;
    this.summarizeBtn.disabled = true;
    this.analyzeBtn.disabled = true;
  }
  
  /**
   * Hide loading spinner and enable buttons
   */
  hideLoading() {
    this.isProcessing = false;
    this.spinner.hidden = true;
    this.summarizeBtn.disabled = false;
    this.analyzeBtn.disabled = false;
  }
  
  /**
   * Display results in output area
   * @param {string} content - Content to display (supports HTML)
   */
  displayOutput(content) {
    this.output.innerHTML = content;
    this.output.hidden = false;
    ErrorHandler.clearError(this.error);
  }
  
  /**
   * Render markdown-like text to HTML
   * Simple renderer for basic markdown formatting
   * @param {string} text - Text to render
   * @returns {string} HTML string
   */
  renderMarkdown(text) {
    let html = text;
    
    // Convert **bold** to <strong>
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em>
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Convert bullet points (- item or * item) to list items
    const lines = html.split('\n');
    let inList = false;
    const processedLines = [];
    
    for (let line of lines) {
      const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
      
      if (bulletMatch) {
        if (!inList) {
          processedLines.push('<ul>');
          inList = true;
        }
        processedLines.push(`<li>${bulletMatch[1]}</li>`);
      } else {
        if (inList) {
          processedLines.push('</ul>');
          inList = false;
        }
        
        // Convert line breaks to <br> for non-empty lines
        if (line.trim()) {
          processedLines.push(`<p>${line}</p>`);
        }
      }
    }
    
    if (inList) {
      processedLines.push('</ul>');
    }
    
    return processedLines.join('\n');
  }
  
  /**
   * Handle Instant Summary button click
   * 
   * PRIVACY: This function processes all data locally using Chrome's built-in
   * Summarizer API. No article text or user data is sent to external servers.
   * All processing happens on the user's device.
   */
  async handleInstantSummary() {
    console.log('=== INSTANT SUMMARY CLICKED ===');
    
    if (this.isProcessing) {
      console.log('Already processing, ignoring click');
      return;
    }
    
    try {
      console.log('Starting instant summary process...');
      this.showLoading();
      ErrorHandler.clearError(this.error);
      
      // Check API availability first
      console.log('Checking Summarizer API availability...');
      const availability = await this.summarizerService.checkAvailability();
      console.log('API availability:', availability);
      console.log('Is string, not object. Value:', availability);
      
      if (!availability.available) {
        console.error('Summarizer API not available:', availability.reason);
        const error = new Error(availability.reason);
        error.name = 'APIUnavailableError';
        throw error;
      }
      
      // Check user activation
      console.log('Checking user activation...');
      if (!this.summarizerService.checkUserActivation()) {
        console.error('User activation not active');
        const error = new Error('User activation required. Please click the button again.');
        error.name = 'UserActivationError';
        throw error;
      }
      console.log('User activation OK');
      
      // Get page text
      console.log('Getting page text from content script...');
      const { text, url } = await this.getPageText();
      console.log(`Got page text: ${text.length} characters from ${url}`);
      
      // Generate cache key
      const cacheKey = await this.cache.generateCacheKey(url, text);
      
      // Check cache first
      if (await this.cache.isValid(cacheKey)) {
        const cached = await this.cache.get(cacheKey);
        console.log('Using cached summary');
        
        const html = `
          <div class="result-header">
            <h3>📝 Instant Summary</h3>
            <span class="cache-badge">Cached</span>
          </div>
          <div class="summary-content">
            ${this.renderMarkdown(cached.value)}
          </div>
        `;
        
        this.displayOutput(html);
        this.hideLoading();
        return;
      }
      
      // Check if model is ready (already downloaded)
      const isModelReady = availability.reason === 'readily';
      console.log('Model ready:', isModelReady, 'reason:', availability.reason);

      // Generate new summary - only show download UI when actual progress events arrive
      console.log('Generating new summary...');
      let downloadShown = false;
      // NUR Progress-Callback übergeben wenn Model NICHT readily ist
      const progressCallback = (!isModelReady) ? (percent) => {
        const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
        if (!downloadShown) {
          this.output.innerHTML = '<div class="info-message"><p>Downloading AI model...</p></div>';
          this.output.hidden = false;
          downloadShown = true;
        }
        this.output.innerHTML = `<div class="info-message"><p>Downloading AI model... ${safePercent}%</p></div>`;
        this.output.hidden = false;
      } : null;

      const summary = await this.summarizerService.summarize(text, 'Web article', progressCallback);
      
      // Cache the result
      await this.cache.set(cacheKey, summary);
      
      // Display result
      const html = `
        <div class="result-header">
          <h3>📝 Instant Summary</h3>
        </div>
        <div class="summary-content">
          ${this.renderMarkdown(summary)}
        </div>
      `;
      
      this.displayOutput(html);
      
    } catch (error) {
      console.error('=== ERROR in handleInstantSummary ===');
      console.error('Error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      const errorInfo = ErrorHandler.handle(error, 'instantSummary');
      console.log('Error info:', errorInfo);
      
      // Show retry button for recoverable errors
      ErrorHandler.displayError(
        errorInfo.message, 
        this.error, 
        this.output,
        {
          showRetry: errorInfo.recoverable,
          onRetry: () => this.handleInstantSummary()
        }
      );
    } finally {
      console.log('handleInstantSummary finally block');
      this.hideLoading();
    }
  }
  
  /**
   * Generate search query using local Summarizer API
   * @param {string} articleText - Article text to analyze
   * @returns {Promise<string>} Generated search query
   */
  async generateSearchQuery(articleText, meta = {}) {
    try {
      console.log('Generating search query using local Summarizer API...');
      
      // Check API availability
      const availability = await this.summarizerService.checkAvailability();
      if (!availability.available) {
        console.warn('Summarizer API not available, skipping query generation');
        return null;
      }
      
      // Create a specialized summarizer for key points extraction
      const querySummarizer = await Summarizer.create({
        // Produce a single-line, query-like headline
        type: 'headline',
        length: 'short',
        sharedContext: 'Produce a concise headline suitable as a web search query (no markdown).',
        outputLanguage: 'en'
      });
      
      // Generate key points with proper input truncation (limit to 5000 chars)
      const truncatedText = articleText.substring(0, 5000);
      // Pass output language explicitly to avoid API warnings and ensure consistent output
      const keyPoints = await querySummarizer.summarize(truncatedText, { outputLanguage: 'en', context: 'Return concise, comma-separated search keyphrases without markdown.' });
      
      // Clean up the summarizer
      querySummarizer.destroy();
      
      // Sanitize into a clean search query: remove bullets/markdown and collapse whitespace
      let searchQuery = keyPoints
        .replace(/^[-*]\s+/gm, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 300);

      // If the result looks generic (e.g., site-wide headlines), fall back to page heading/title
      const generic = /\b(latest updates|breaking news|top stories|live updates|news|politics|world|home)\b/i;
      if (generic.test(searchQuery)) {
        const fallback = (meta.heading && meta.heading.length > 20) ? meta.heading : (meta.title || '');
        if (fallback) {
          searchQuery = fallback.trim().replace(/[\r\n]+/g, ' ').slice(0, 300);
          console.log('Search query looked generic; using fallback heading/title');
        }
      }
      console.log('Generated search query:', searchQuery);
      
      return searchQuery;
      
    } catch (error) {
      console.warn('Failed to generate search query:', error.message);
      return null;
    }
  }
  
  /**
   * Perform deep dive analysis using backend API
   * @param {string} text - Article text to analyze
   * @param {string[]} concepts - Optional array of concepts to define
   * @param {string} searchQuery - Optional search query generated by local AI
   * @returns {Promise<Object>} Analysis result with relatedArticles, definitions, and arguments
   */
  async deepDiveAnalysis(text, concepts = [], searchQuery = null) {
    // Backend API URL (configurable)
    // In production, this should be an HTTPS URL
    // For local development, HTTP localhost is allowed
    const BACKEND_URL = 'http://localhost:3001';
    
    // Enforce HTTPS in production (when not using localhost)
    const url = new URL(BACKEND_URL);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.protocol !== 'https:') {
      throw new Error('Backend URL must use HTTPS for security. HTTP is only allowed for localhost development.');
    }
    
    try {
      // Send POST request to backend
      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          article: text,
          concepts: concepts.length > 0 ? concepts : undefined,
          searchQuery: searchQuery || undefined
        })
      });
      
      // Handle non-OK responses
      if (!response.ok) {
        let errorMessage = `Server error: ${response.status}`;
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        
        // Create appropriate error based on status code
        const error = new Error(errorMessage);
        
        if (response.status === 429) {
          error.name = 'RateLimitError';
        } else if (response.status >= 500) {
          error.name = 'ServerError';
        } else {
          error.name = 'NetworkError';
        }
        
        throw error;
      }
      
      // Parse JSON response
      const result = await response.json();
      
      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      // Handle both old and new response formats for backward compatibility
      return {
        relatedArticles: result.relatedArticles || [],
        definitions: result.analysis?.definitions || result.definitions || [],
        arguments: result.analysis?.arguments || result.arguments || { main: [], counter: [] }
      };
      
    } catch (error) {
      // Handle fetch errors (network issues, timeouts, etc.)
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        const networkError = new Error('Unable to connect to analysis service. Please check your internet connection and ensure the backend server is running.');
        networkError.name = 'NetworkError';
        throw networkError;
      }
      
      // Re-throw other errors
      throw error;
    }
  }
  
  /**
   * Render analysis results as HTML
   * @param {Object} analysis - Analysis result object
   * @returns {string} HTML string
   */
  renderAnalysisResults(analysis) {
    let html = '<div class="result-header"><h3>🧠 Deep Dive Analysis</h3></div>';
    
    // Related Articles section
    if (analysis.relatedArticles && analysis.relatedArticles.length > 0) {
      html += '<div class="analysis-section">';
      html += '<h4>📚 Related Articles</h4>';
      html += '<ul class="related-articles">';
      
      for (const article of analysis.relatedArticles) {
        // Ensure links open in new tabs with target="_blank" and rel="noopener noreferrer"
        html += `<li><a href="${this.escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(article.title)}</a></li>`;
      }
      
      html += '</ul></div>';
  } else {
    // Show message when no articles are found
    html += '<div class="analysis-section">';
    html += '<h4>📚 Related Articles</h4>';
    html += '<p class="info-text">No related articles found at this time. This can happen when the search grounding service is temporarily unavailable. The analysis of definitions and arguments is still complete below.</p>';
    html += '</div>';
  }
    
    // Key Terms section
    if (analysis.definitions && analysis.definitions.length > 0) {
      html += '<div class="analysis-section">';
      html += '<h4>📖 Key Terms</h4>';
      html += '<dl class="definitions">';
      
      for (const def of analysis.definitions) {
        html += `<dt>${this.escapeHtml(def.term)}</dt>`;
        html += `<dd>${this.escapeHtml(def.definition)}</dd>`;
      }
      
      html += '</dl></div>';
    }
    
    // Arguments section
    if (analysis.arguments) {
      // Main arguments
      if (analysis.arguments.main && analysis.arguments.main.length > 0) {
        html += '<div class="analysis-section">';
        html += '<h4>✅ Main Arguments</h4>';
        html += '<ul class="arguments">';
        
        for (const arg of analysis.arguments.main) {
          html += `<li>${this.escapeHtml(arg)}</li>`;
        }
        
        html += '</ul></div>';
      }
      
      // Counter arguments
      if (analysis.arguments.counter && analysis.arguments.counter.length > 0) {
        html += '<div class="analysis-section">';
        html += '<h4>⚖️ Counter Arguments</h4>';
        html += '<ul class="arguments counter">';
        
        for (const arg of analysis.arguments.counter) {
          html += `<li>${this.escapeHtml(arg)}</li>`;
        }
        
        html += '</ul></div>';
      }
    }
    
    // If no content was generated
    if (!html.includes('analysis-section')) {
      html += '<div class="info-message">';
      html += '<p>No analysis results were generated. Please try again.</p>';
      html += '</div>';
    }
    
    return html;
  }
  
  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Handle Deep Dive Analysis button click
   * 
   * PRIVACY: This function sends article text to an external backend service
   * for analysis using the Gemini API. The connection uses HTTPS for security.
   * Users are informed of this data transmission in the privacy notice.
   */
  async handleDeepDiveAnalysis() {
    console.log('=== DEEP DIVE ANALYSIS CLICKED ===');
    
    if (this.isProcessing) {
      console.log('Already processing, ignoring click');
      return;
    }
    
    try {
      console.log('Starting deep dive analysis process...');
      ErrorHandler.clearError(this.error);
      
      // Reset render state for progressive display
      this.renderState = { headerRendered: false, articlesRendered: false, analysisRendered: false };
      
      // Get page text
      console.log('Getting page text from content script...');
      const { text, url } = await this.getPageText();

      // Generate cache key
      const baseKey = await this.cache.generateCacheKey(url, text);
      const cacheKey = `${baseKey}:deep-dive`;

      // Check cache
      if (await this.cache.isValid(cacheKey)) {
        const cached = await this.cache.get(cacheKey);
        if (cached?.value) {
          console.log('Using cached deep dive analysis');
          this.displayCachedResults(cached.value);
          return;
        }
      }
      
      // Wait for search query if in progress
      await this.waitForSearchQuery();
      const searchQuery = this.preGeneratedSearchQuery;
      
      console.log(`Article length: ${text.length} characters from ${url}`);
      console.log(`Search query: ${searchQuery || 'none'}`);
      
      // Start both API calls in parallel
      const searchPromise = this.fetchRelatedArticles(searchQuery);
      const analysisPromise = this.fetchAnalysis(text, []);
      
      // Immediately render header and placeholders to establish order
      this.output.innerHTML = `
        <div class="result-header"><h3>🧠 Deep Dive Analysis</h3></div>
        <div id="analysis-placeholder" class="loading-placeholder">
          <div class="spinner-small"></div>
          <p>Analyzing article content...</p>
        </div>
        <div id="articles-placeholder" class="loading-placeholder">
          <div class="spinner-small"></div>
          <p>Finding related articles...</p>
        </div>
      `;
      this.output.hidden = false;
      this.renderState.headerRendered = true;
      
      // Replace placeholders as each API call completes
      analysisPromise.then(analysis => {
        console.log('Analysis completed:', {
          definitions: analysis.definitions?.length || 0,
          mainArgs: analysis.arguments?.main?.length || 0,
          counterArgs: analysis.arguments?.counter?.length || 0
        });
        this.displayAnalysis(analysis);
      }).catch(error => {
        console.warn('Analysis failed:', error.message);
        const placeholder = document.getElementById('analysis-placeholder');
        if (placeholder) {
          placeholder.outerHTML = '<div class="analysis-section"><p class="error-text">Analysis failed. Please try again.</p></div>';
        }
      });
      
      searchPromise.then(articles => {
        console.log(`Search completed: ${articles.length} articles`);
        this.displayRelatedArticles(articles);
      }).catch(error => {
        console.warn('Search failed:', error.message);
        this.displayRelatedArticles([]);
      });
      
      // Wait for both to complete for caching
      const analysis = await analysisPromise;
      
      // Cache combined result
      const combinedResult = {
        relatedArticles: await searchPromise.catch(() => []),
        definitions: analysis.definitions,
        arguments: analysis.arguments
      };
      await this.cache.set(cacheKey, combinedResult);
      
    } catch (error) {
      console.error('Deep dive analysis error:', error);
      const errorInfo = ErrorHandler.handle(error, 'deepDiveAnalysis');
      ErrorHandler.displayError(
        errorInfo.message, 
        this.error, 
        this.output,
        { showRetry: errorInfo.recoverable, onRetry: () => this.handleDeepDiveAnalysis() }
      );
    }
  }
  
  /**
   * Wait for search query generation to complete
   */
  async waitForSearchQuery() {
    if (this.isGeneratingQuery) {
      console.log('Waiting for search query generation...');
      const startWait = Date.now();
      const maxWait = 10000;
      
      while (this.isGeneratingQuery && (Date.now() - startWait) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (this.isGeneratingQuery) {
        console.warn('Search query generation timed out');
      }
    }
    
    // If no pre-generated query and mode is on-demand, generate now
    const mode = await this.settings.get('queryGenerationMode');
    if (!this.preGeneratedSearchQuery && mode === 'on-demand' && !this.isGeneratingQuery) {
      console.log('Generating search query on-demand...');
      await this.preGenerateSearchQuery();
    }
  }
  
  /**
   * Fetch related articles from /search endpoint
   * @param {string} searchQuery - Search query
   * @returns {Promise<Array>} Related articles
   */
  async fetchRelatedArticles(searchQuery) {
    if (!searchQuery) {
      console.warn('No search query available');
      return [];
    }
    
    const BACKEND_URL = 'http://localhost:3001';
    const url = new URL(BACKEND_URL);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.protocol !== 'https:') {
      throw new Error('Backend URL must use HTTPS for security');
    }
    
    const response = await fetch(`${BACKEND_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchQuery })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Search failed: ${response.status}`);
    }

    const result = await response.json();
    return result.articles || [];
  }
  
  /**
   * Fetch analysis from /analyze endpoint
   * @param {string} text - Article text
   * @param {Array} concepts - Optional concepts
   * @returns {Promise<Object>} Analysis with definitions and arguments
   */
  async fetchAnalysis(text, concepts = []) {
    const BACKEND_URL = 'http://localhost:3001';
    const url = new URL(BACKEND_URL);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.protocol !== 'https:') {
      throw new Error('Backend URL must use HTTPS for security');
    }
    
    const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article: text, concepts })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || `Analysis failed: ${response.status}`;
      const error = new Error(errorMessage);
      if (response.status === 429) error.name = 'RateLimitError';
      else if (response.status >= 500) error.name = 'ServerError';
      else error.name = 'NetworkError';
      throw error;
    }

    return await response.json();
  }
  
  /**
   * Display related articles immediately
   * @param {Array} articles - Related articles
   */
  displayRelatedArticles(articles) {
    console.log('displayRelatedArticles called');
    
    let html = '';
    
    // Add articles section
    html += '<div class="analysis-section"><h4>📚 Related Articles</h4>';
    
    if (articles.length > 0) {
      html += '<ul class="related-articles">';
      for (const article of articles) {
        html += `<li><a href="${this.escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(article.title)}</a></li>`;
      }
      html += '</ul>';
    } else {
      html += '<p class="info-text">No related articles found at this time. This can happen when the search grounding service is temporarily unavailable.</p>';
    }
    html += '</div>';
    
    // Replace placeholder with articles content
    const placeholder = document.getElementById('articles-placeholder');
    if (placeholder) {
      placeholder.outerHTML = html;
      console.log('Articles placeholder replaced');
    } else {
      // Fallback: append if placeholder doesn't exist
      this.output.innerHTML += html;
      console.log('Articles appended (no placeholder found)');
    }
    
    this.renderState.articlesRendered = true;
  }
  
  /**
   * Display analysis (definitions & arguments)
   * @param {Object} analysis - Analysis with definitions and arguments
   */
  displayAnalysis(analysis) {
    console.log('displayAnalysis called');
    
    let html = '';
    
    // Definitions
    if (analysis.definitions?.length > 0) {
      html += '<div class="analysis-section"><h4>📖 Key Terms</h4><dl class="definitions">';
      for (const def of analysis.definitions) {
        html += `<dt>${this.escapeHtml(def.term)}</dt><dd>${this.escapeHtml(def.definition)}</dd>`;
      }
      html += '</dl></div>';
    }
    
    // Main arguments
    if (analysis.arguments?.main?.length > 0) {
      html += '<div class="analysis-section"><h4>✅ Main Arguments</h4><ul class="arguments">';
      for (const arg of analysis.arguments.main) {
        html += `<li>${this.escapeHtml(arg)}</li>`;
      }
      html += '</ul></div>';
    }
    
    // Counter arguments
    if (analysis.arguments?.counter?.length > 0) {
      html += '<div class="analysis-section"><h4>⚖️ Counter Arguments</h4><ul class="arguments counter">';
      for (const arg of analysis.arguments.counter) {
        html += `<li>${this.escapeHtml(arg)}</li>`;
      }
      html += '</ul></div>';
    }
    
    // Replace placeholder with analysis content
    const placeholder = document.getElementById('analysis-placeholder');
    if (placeholder) {
      placeholder.outerHTML = html;
      console.log('Analysis placeholder replaced');
    } else {
      // Fallback: append if placeholder doesn't exist
      this.output.innerHTML += html;
      console.log('Analysis appended (no placeholder found)');
    }
    
    this.renderState.analysisRendered = true;
  }
  
  /**
   * Display cached results
   * @param {Object} cached - Cached analysis result
   */
  displayCachedResults(cached) {
    let html = this.renderAnalysisResults(cached);
    html = html.replace(
      '<div class="result-header">',
      '<div class="result-header"><span class="cache-badge">Cached</span>'
    );
    this.displayOutput(html);
  }
  
  /**
   * Display analysis results progressively for fastest perceived performance
   * @param {Object} analysis - Analysis result with relatedArticles and analysis fields
   */
  displayProgressiveResults(analysis) {
    // Start with header and search results (fastest to render)
    let html = '<div class="result-header"><h3>🧠 Deep Dive Analysis</h3></div>';
    
    // Display search results immediately
    if (analysis.relatedArticles && analysis.relatedArticles.length > 0) {
      html += '<div class="analysis-section">';
      html += '<h4>📚 Related Articles</h4>';
      html += '<ul class="related-articles">';
      
      for (const article of analysis.relatedArticles) {
        html += `<li><a href="${this.escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(article.title)}</a></li>`;
      }
      
      html += '</ul></div>';
    } else {
      html += '<div class="analysis-section">';
      html += '<h4>📚 Related Articles</h4>';
      html += '<p class="info-text">No related articles found. The analysis focused on the content itself.</p>';
      html += '</div>';
    }
    
    // Display initial content
    this.displayOutput(html);
    
    // Use setTimeout to allow UI to update before processing heavier analysis sections
    setTimeout(() => {
      this.appendAnalysisSections(analysis);
    }, 0);
  }

  /**
   * Append definitions and arguments sections to existing output
   * @param {Object} analysis - Analysis result
   */
  appendAnalysisSections(analysis) {
    let additionalHtml = '';
    
    // Get the analysis data (handle both old and new response formats)
    const definitions = analysis.analysis?.definitions || analysis.definitions || [];
    const args = analysis.analysis?.arguments || analysis.arguments || { main: [], counter: [] };
    
    // Key Terms section
    if (definitions.length > 0) {
      additionalHtml += '<div class="analysis-section">';
      additionalHtml += '<h4>📖 Key Terms</h4>';
      additionalHtml += '<dl class="definitions">';
      
      for (const def of definitions) {
        additionalHtml += `<dt>${this.escapeHtml(def.term)}</dt>`;
        additionalHtml += `<dd>${this.escapeHtml(def.definition)}</dd>`;
      }
      
      additionalHtml += '</dl></div>';
    }
    
    // Main arguments
    if (args.main && args.main.length > 0) {
      additionalHtml += '<div class="analysis-section">';
      additionalHtml += '<h4>✅ Main Arguments</h4>';
      additionalHtml += '<ul class="arguments">';
      
      for (const arg of args.main) {
        additionalHtml += `<li>${this.escapeHtml(arg)}</li>`;
      }
      
      additionalHtml += '</ul></div>';
    }
    
    // Counter arguments
    if (args.counter && args.counter.length > 0) {
      additionalHtml += '<div class="analysis-section">';
      additionalHtml += '<h4>⚖️ Counter Arguments</h4>';
      additionalHtml += '<ul class="arguments counter">';
      
      for (const arg of args.counter) {
        additionalHtml += `<li>${this.escapeHtml(arg)}</li>`;
      }
      
      additionalHtml += '</ul></div>';
    }
    
    // Append to existing output
    if (additionalHtml) {
      this.output.innerHTML += additionalHtml;
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.summarizerService.destroy();
  }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('=== DOM CONTENT LOADED ===');
  console.log('DeepDive Assistant popup loaded');
  console.log('Document ready state:', document.readyState);
  console.log('Body element:', document.body ? 'found' : 'MISSING');
  
  // Log all elements we're looking for
  const elements = {
    summarizeBtn: document.getElementById('summarizeBtn'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    spinner: document.getElementById('spinner'),
    output: document.getElementById('output'),
    error: document.getElementById('error')
  };
  
  console.log('DOM elements check:', {
    summarizeBtn: elements.summarizeBtn ? 'found' : 'MISSING',
    analyzeBtn: elements.analyzeBtn ? 'found' : 'MISSING', 
    spinner: elements.spinner ? 'found' : 'MISSING',
    output: elements.output ? 'found' : 'MISSING',
    error: elements.error ? 'found' : 'MISSING'
  });
  
  // Create application instance
  try {
    console.log('Creating DeepDiveAssistant instance...');
    const app = new DeepDiveAssistant();
    console.log('DeepDiveAssistant instance created successfully');
    
    // Cleanup on window unload
    window.addEventListener('unload', () => {
      console.log('Window unloading, cleaning up...');
      app.destroy();
    });
  } catch (error) {
    console.error('FATAL ERROR creating DeepDiveAssistant:', error);
    console.error('Error stack:', error.stack);
  }
});
