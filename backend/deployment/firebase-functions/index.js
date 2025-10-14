import functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// Get configuration from Firebase Functions config
const GEMINI_API_KEY = functions.config().gemini?.api_key;
const ALLOWED_EXTENSION_ID = functions.config().extension?.id;

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not configured. Run: firebase functions:config:set gemini.api_key="YOUR_KEY"');
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: 'You are a research assistant that analyzes articles and provides structured insights. Your responses must be in valid JSON format. Provide accurate, relevant information based on the article content.'
});

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Allow specific extension ID in production
    if (ALLOWED_EXTENSION_ID && origin === `chrome-extension://${ALLOWED_EXTENSION_ID}`) {
      callback(null, true);
    } else if (origin.startsWith('chrome-extension://')) {
      // Allow any chrome extension in development
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

// Rate limiting using Firestore
const rateLimit = async (req, res, next) => {
  try {
    const origin = req.headers.origin || 'unknown';
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 10; // 10 requests per minute
    
    const rateLimitRef = admin.firestore().collection('rateLimits').doc(origin);
    const doc = await rateLimitRef.get();
    
    if (!doc.exists) {
      await rateLimitRef.set({
        requests: 1,
        windowStart: now
      });
      next();
      return;
    }
    
    const data = doc.data();
    const windowStart = data.windowStart;
    const requests = data.requests;
    
    // Reset window if expired
    if (now - windowStart > windowMs) {
      await rateLimitRef.set({
        requests: 1,
        windowStart: now
      });
      next();
      return;
    }
    
    // Check if limit exceeded
    if (requests >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((windowStart + windowMs - now) / 1000)
      });
      return;
    }
    
    // Increment counter
    await rateLimitRef.update({
      requests: requests + 1
    });
    
    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    next(); // Allow request on rate limit error
  }
};

app.use(rateLimit);

// Helper functions (same as server.js)
function buildAnalysisPrompt(article, concepts = []) {
  const conceptsText = concepts.length > 0 
    ? concepts.join(', ') 
    : 'identify 3-5 key terms from the article';
  
  return `Analyze the following article and provide a structured response in JSON format.

Article:
${article}

Please provide:
1. Three related articles (with realistic titles and URLs from reputable sources)
2. Definitions for these key terms: ${conceptsText}
3. Main arguments presented in the article
4. Potential counter-arguments or alternative perspectives

Format your response as valid JSON with this structure:
{
  "relatedArticles": [
    {"title": "...", "url": "https://..."},
    {"title": "...", "url": "https://..."},
    {"title": "...", "url": "https://..."}
  ],
  "definitions": [
    {"term": "...", "definition": "..."}
  ],
  "arguments": {
    "main": ["argument 1", "argument 2", ...],
    "counter": ["counter-argument 1", "counter-argument 2", ...]
  }
}

Respond ONLY with the JSON object, no additional text or markdown formatting.`;
}

function parseGeminiResponse(text) {
  const jsonCodeBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonCodeBlockMatch) {
    try {
      return validateAndNormalizeResponse(JSON.parse(jsonCodeBlockMatch[1]));
    } catch (error) {
      console.warn('Failed to parse JSON from code block');
    }
  }
  
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return validateAndNormalizeResponse(JSON.parse(jsonObjectMatch[0]));
    } catch (error) {
      console.warn('Failed to parse extracted JSON object');
    }
  }
  
  try {
    return validateAndNormalizeResponse(JSON.parse(text));
  } catch (error) {
    console.warn('Failed to parse entire response as JSON');
  }
  
  return {
    relatedArticles: [],
    definitions: [],
    arguments: {
      main: [text.substring(0, 500) + (text.length > 500 ? '...' : '')],
      counter: []
    }
  };
}

function validateAndNormalizeResponse(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Response must be an object');
  }
  
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
      .slice(0, 10);
  }
  
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
      .slice(0, 20);
  }
  
  let mainArguments = [];
  let counterArguments = [];
  
  if (data.arguments && typeof data.arguments === 'object') {
    if (Array.isArray(data.arguments.main)) {
      mainArguments = data.arguments.main
        .filter(arg => typeof arg === 'string' && arg.trim().length > 0)
        .map(arg => arg.trim())
        .slice(0, 20);
    }
    
    if (Array.isArray(data.arguments.counter)) {
      counterArguments = data.arguments.counter
        .filter(arg => typeof arg === 'string' && arg.trim().length > 0)
        .map(arg => arg.trim())
        .slice(0, 20);
    }
  }
  
  return {
    relatedArticles,
    definitions,
    arguments: {
      main: mainArguments,
      counter: counterArguments
    }
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Analyze endpoint
app.post('/analyze', async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const { article, concepts } = req.body;
    
    if (!article || typeof article !== 'string' || article.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or invalid article text' });
    }
    
    if (article.length > 500000) {
      return res.status(400).json({ error: 'Article text is too long. Maximum 500,000 characters allowed.' });
    }
    
    if (concepts !== undefined && (!Array.isArray(concepts) || concepts.length > 20)) {
      return res.status(400).json({ error: 'Invalid concepts parameter' });
    }
    
    const prompt = buildAnalysisPrompt(article, concepts);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsedResponse = parseGeminiResponse(responseText);
    
    const duration = Date.now() - startTime;
    console.log(`Analysis completed in ${duration}ms`);
    
    res.json(parsedResponse);
    
  } catch (error) {
    console.error('Analysis error:', error);
    next(error);
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({ 
    error: err.message || 'Internal server error'
  });
});

// Export the Express app as a Firebase Function
export const api = functions.https.onRequest(app);
