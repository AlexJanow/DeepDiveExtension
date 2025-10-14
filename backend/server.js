import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { createRateLimitMiddleware } from './rate-limiter.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set in environment variables');
  process.exit(1);
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure Gemini model with system instructions
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  systemInstruction: 'You are a research assistant that analyzes articles and provides structured insights. Your responses must be in valid JSON format. Provide accurate, relevant information based on the article content.'
});

// CORS configuration for Chrome Extension
const corsOptions = {
  origin: (origin, callback) => {
    // Allow chrome-extension:// origins
    if (!origin || origin.startsWith('chrome-extension://')) {
      // In production, check for specific extension ID if configured
      if (process.env.NODE_ENV === 'production' && process.env.ALLOWED_EXTENSION_ID) {
        const allowedOrigin = `chrome-extension://${process.env.ALLOWED_EXTENSION_ID}`;
        if (origin === allowedOrigin) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS - invalid extension ID'));
        }
      } else {
        callback(null, true);
      }
    } else if (process.env.NODE_ENV === 'development') {
      // Allow all origins in development
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Rate limiting middleware
// 10 requests per minute per origin in production
// 30 requests per minute in development for easier testing
const rateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: process.env.NODE_ENV === 'production' ? 10 : 30
};

app.use('/analyze', createRateLimitMiddleware(rateLimitConfig));

// Helper function to build analysis prompt
function buildAnalysisPrompt(article, concepts = []) {
  const conceptsText = concepts.length > 0 
    ? concepts.join(', ') 
    : 'identify 3-5 key terms from the article';
  
  return `Analyze the following article and provide a structured response.

IMPORTANT: You MUST use Google Search to find real, existing related articles. Do NOT generate fake URLs. Only return URLs that you have actually found through search grounding.

Article:
${article}

Please provide:
1. Related articles - USE GOOGLE SEARCH to find 3 real articles on reputable sites (NOT fabricated)
2. Definitions for these key terms: ${conceptsText}
3. Main arguments presented in the article
4. Potential counter-arguments or alternative perspectives

CRITICAL: If you cannot find real related articles via Google Search, return an empty relatedArticles array. Do not make up URLs.

Return valid JSON:
{
  "relatedArticles": [{"title": "...", "url": "https://..."}],
  "definitions": [{"term": "...", "definition": "..."}],
  "arguments": {
    "main": ["argument 1", "argument 2", ...],
    "counter": ["counter-argument 1", "counter-argument 2", ...]
  }
}

Respond ONLY with the JSON object, no additional text or markdown formatting.`;
}
// Helper to extract grounded links from Gemini response if available
function extractRelatedArticlesFromGrounding(geminiResponse) {
  try {
    const articles = [];
    const urls = new Set();
    const candidates = geminiResponse?.candidates || [];
    
    for (const candidate of candidates) {
      const metadata = candidate.groundingMetadata;
      if (!metadata?.groundingChunks) {
        console.log('No grounding metadata or chunks found in candidate');
        continue;
      }
      
      console.log(`Found ${metadata.groundingChunks.length} grounding chunks`);
      
      // Extract from groundingChunks (correct structure per @google/generative-ai types)
      for (const chunk of metadata.groundingChunks) {
        if (chunk.web?.uri) {
          const url = chunk.web.uri;
          const title = chunk.web.title || 'Related Article';
          
          // Only add unique URLs
          if (!urls.has(url)) {
            urls.add(url);
            articles.push({ title, url });
            console.log(`Extracted grounded article: ${title} - ${url}`);
          }
        }
      }
      
      // If we found articles in this candidate, we're done
      if (articles.length > 0) break;
    }
    
    console.log(`Total grounded articles extracted: ${articles.length}`);
    return articles.slice(0, 10);
  } catch (error) {
    console.error('Error extracting grounded articles:', error);
    return [];
  }
}

// Helper function to parse Gemini response
function parseGeminiResponse(text) {
  console.log('Parsing Gemini response...');
  
  // Try to extract JSON from markdown code blocks (```json...```)
  const jsonCodeBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonCodeBlockMatch) {
    console.log('Found JSON in markdown code block');
    try {
      const parsed = JSON.parse(jsonCodeBlockMatch[1]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.warn('Failed to parse JSON from code block:', error.message);
    }
  }
  
  // Try to extract JSON from generic code blocks (```...```)
  const codeBlockMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    console.log('Found content in generic code block');
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.warn('Failed to parse JSON from generic code block:', error.message);
    }
  }
  
  // Try to find JSON object in the text (look for {...})
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    console.log('Found JSON object in text');
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.warn('Failed to parse extracted JSON object:', error.message);
    }
  }
  
  // Try to parse the entire text as JSON
  try {
    console.log('Attempting to parse entire response as JSON');
    const parsed = JSON.parse(text);
    return validateAndNormalizeResponse(parsed);
  } catch (error) {
    console.warn('Failed to parse entire response as JSON:', error.message);
  }
  
  // Fallback: return structured response with raw text
  console.log('Using fallback response structure');
  return {
    relatedArticles: [],
    definitions: [],
    arguments: {
      main: [text.substring(0, 500) + (text.length > 500 ? '...' : '')],
      counter: []
    }
  };
}

// Helper function to validate and normalize response structure
function validateAndNormalizeResponse(data) {
  console.log('Validating response structure...');
  
  // Ensure data is an object
  if (typeof data !== 'object' || data === null) {
    throw new Error('Response must be an object');
  }
  
  // Validate and normalize relatedArticles
  let relatedArticles = [];
  if (Array.isArray(data.relatedArticles)) {
    relatedArticles = data.relatedArticles
      .filter(article => 
        article && 
        typeof article === 'object' && 
        typeof article.title === 'string' && 
        typeof article.url === 'string' &&
        article.title.trim().length > 0 &&
        article.url.trim().length > 0
      )
      .map(article => ({
        title: article.title.trim(),
        url: article.url.trim()
      }))
      .slice(0, 10); // Limit to 10 articles
    
    // Filter out obviously fake/suspicious domains
    const suspiciousPatterns = [
      'example.com',
      'placeholder.com',
      'yoursite.com',
      'website.com',
      'test.com',
      'sample.com'
    ];
    
    relatedArticles = relatedArticles.filter(article => {
      const url = article.url.toLowerCase();
      const isSuspicious = suspiciousPatterns.some(pattern => url.includes(pattern));
      if (isSuspicious) {
        console.warn(`Filtered suspicious URL: ${article.url}`);
      }
      return !isSuspicious;
    });
  }
  
  // Validate and normalize definitions
  let definitions = [];
  if (Array.isArray(data.definitions)) {
    definitions = data.definitions
      .filter(def => 
        def && 
        typeof def === 'object' && 
        typeof def.term === 'string' && 
        typeof def.definition === 'string' &&
        def.term.trim().length > 0 &&
        def.definition.trim().length > 0
      )
      .map(def => ({
        term: def.term.trim(),
        definition: def.definition.trim()
      }))
      .slice(0, 20); // Limit to 20 definitions
  }
  
  // Validate and normalize arguments
  let mainArguments = [];
  let counterArguments = [];
  
  if (data.arguments && typeof data.arguments === 'object') {
    if (Array.isArray(data.arguments.main)) {
      mainArguments = data.arguments.main
        .filter(arg => typeof arg === 'string' && arg.trim().length > 0)
        .map(arg => arg.trim())
        .slice(0, 20); // Limit to 20 arguments
    }
    
    if (Array.isArray(data.arguments.counter)) {
      counterArguments = data.arguments.counter
        .filter(arg => typeof arg === 'string' && arg.trim().length > 0)
        .map(arg => arg.trim())
        .slice(0, 20); // Limit to 20 counter-arguments
    }
  }
  
  const normalized = {
    relatedArticles,
    definitions,
    arguments: {
      main: mainArguments,
      counter: counterArguments
    }
  };
  
  console.log(`Validation complete: ${relatedArticles.length} articles, ${definitions.length} definitions, ${mainArguments.length} main args, ${counterArguments.length} counter args`);
  
  return normalized;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Analyze endpoint
app.post('/analyze', async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Log incoming request
    console.log(`[${new Date().toISOString()}] POST /analyze - Request received`);
    
    // Validate request body
    const { article, concepts } = req.body;
    
    if (!article) {
      console.warn('Validation failed: Missing article text');
      return res.status(400).json({ 
        error: 'Missing required field: article'
      });
    }
    
    if (typeof article !== 'string') {
      console.warn('Validation failed: Article is not a string');
      return res.status(400).json({ 
        error: 'Invalid field type: article must be a string'
      });
    }
    
    if (article.trim().length === 0) {
      console.warn('Validation failed: Empty article text');
      return res.status(400).json({ 
        error: 'Article text cannot be empty'
      });
    }
    
    if (article.length > 500000) { // ~500KB text limit
      console.warn(`Validation failed: Article too long (${article.length} chars)`);
      return res.status(400).json({ 
        error: 'Article text is too long. Maximum 500,000 characters allowed.'
      });
    }
    
    // Validate concepts if provided
    if (concepts !== undefined) {
      if (!Array.isArray(concepts)) {
        console.warn('Validation failed: Concepts is not an array');
        return res.status(400).json({ 
          error: 'Invalid field type: concepts must be an array'
        });
      }
      
      if (concepts.length > 20) {
        console.warn(`Validation failed: Too many concepts (${concepts.length})`);
        return res.status(400).json({ 
          error: 'Too many concepts. Maximum 20 allowed.'
        });
      }
      
      // Validate each concept is a string
      for (const concept of concepts) {
        if (typeof concept !== 'string') {
          console.warn('Validation failed: Concept is not a string');
          return res.status(400).json({ 
            error: 'Invalid concept type: all concepts must be strings'
          });
        }
      }
    }
    
    console.log(`Article length: ${article.length} chars`);
    console.log(`Concepts: ${concepts ? concepts.join(', ') : 'auto-detect'}`);
    
    // Build prompt for Gemini
    const prompt = buildAnalysisPrompt(article, concepts);
    console.log('Calling Gemini API (with Google Search grounding)...');
    
    // Call Gemini API with Google Search grounding tool
    const tools = [{ google_search: {} }];
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: prompt }] }
      ],
      tools
    });
    const responseText = result.response.text();
    
    console.log('Gemini API response received');
    console.log('Response preview:', responseText.substring(0, 200));
    
    // Log grounding metadata for debugging
    const candidate = result.response.candidates?.[0];
    console.log('Grounding metadata:', JSON.stringify({
      hasMetadata: !!candidate?.groundingMetadata,
      chunkCount: candidate?.groundingMetadata?.groundingChunks?.length || 0,
      webSearchQueries: candidate?.groundingMetadata?.webSearchQueries || []
    }, null, 2));
    
    // Try to extract grounded related articles first
    const groundedArticles = extractRelatedArticlesFromGrounding(result.response);
    
    // Parse and validate the response (JSON body)
    const parsedResponse = parseGeminiResponse(responseText);
    
    // Validate grounded URLs and prefer them if valid
    if (groundedArticles.length > 0) {
      const validArticles = groundedArticles.filter(article => {
        try {
          const url = new URL(article.url);
          return url.protocol === 'https:' || url.protocol === 'http:';
        } catch {
          console.warn(`Invalid grounded URL: ${article.url}`);
          return false;
        }
      });
      
      if (validArticles.length > 0) {
        parsedResponse.relatedArticles = validArticles;
        console.log(`Using ${validArticles.length} validated grounded articles`);
      } else {
        console.warn('No valid grounded URLs, falling back to parsed response');
      }
    } else {
      console.warn('No grounded articles found, using parsed response (may contain hallucinated URLs)');
    }
    
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] POST /analyze - Completed in ${duration}ms`);
    
    res.json(parsedResponse);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] POST /analyze - Error after ${duration}ms:`, error);
    
    // Pass error to error handling middleware
    next(error);
  }
});

// 404 handler for unknown routes
app.use((req, res) => {
  console.warn(`[${new Date().toISOString()}] 404 - ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Not found',
    message: `Route ${req.method} ${req.path} does not exist`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log detailed error information
  console.error(`[${new Date().toISOString()}] Error Handler:`, {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Handle specific error types
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: 'Request body too large',
      message: 'Maximum request size is 1MB'
    });
  }
  
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      error: 'Invalid JSON',
      message: 'Request body must be valid JSON'
    });
  }
  
  // Generic error response
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({ 
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`DeepDive Assistant backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS enabled for chrome-extension:// origins`);
  
  // Security reminder for production deployment
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  SECURITY: Ensure this service is deployed with HTTPS enabled');
    console.log('⚠️  The Chrome Extension requires HTTPS for all backend communication');
  } else {
    console.log('ℹ️  Development mode: HTTP is allowed for localhost testing');
  }
});
