import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate API key
if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set');
  process.exit(1);
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: 'You are a research assistant that analyzes articles and provides structured insights. Your responses must be in valid JSON format.'
});

// Copy of parseGeminiResponse function from server.js
function parseGeminiResponse(text) {
  console.log('\n=== Parsing Gemini response ===');
  console.log('Response length:', text.length);
  
  // Try to extract JSON from markdown code blocks (```json...```)
  const jsonCodeBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonCodeBlockMatch) {
    console.log('✓ Found JSON in markdown code block');
    try {
      const parsed = JSON.parse(jsonCodeBlockMatch[1]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.warn('✗ Failed to parse JSON from code block:', error.message);
    }
  }
  
  // Try to extract JSON from generic code blocks (```...```)
  const codeBlockMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    console.log('✓ Found content in generic code block');
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.warn('✗ Failed to parse JSON from generic code block:', error.message);
    }
  }
  
  // Try to find JSON object in the text (look for {...})
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    console.log('✓ Found JSON object in text');
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      console.warn('✗ Failed to parse extracted JSON object:', error.message);
    }
  }
  
  // Try to parse the entire text as JSON
  try {
    console.log('✓ Attempting to parse entire response as JSON');
    const parsed = JSON.parse(text);
    return validateAndNormalizeResponse(parsed);
  } catch (error) {
    console.warn('✗ Failed to parse entire response as JSON:', error.message);
  }
  
  // Fallback: return structured response with raw text
  console.log('⚠ Using fallback response structure');
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
  console.log('=== Validating response structure ===');
  
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
      .slice(0, 10);
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
      .slice(0, 20);
  }
  
  // Validate and normalize arguments
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
  
  const normalized = {
    relatedArticles,
    definitions,
    arguments: {
      main: mainArguments,
      counter: counterArguments
    }
  };
  
  console.log(`✓ Validation complete:`);
  console.log(`  - ${relatedArticles.length} related articles`);
  console.log(`  - ${definitions.length} definitions`);
  console.log(`  - ${mainArguments.length} main arguments`);
  console.log(`  - ${counterArguments.length} counter-arguments`);
  
  return normalized;
}

// Test article
const testArticle = `
Artificial Intelligence and Machine Learning: The Future of Technology

Artificial intelligence (AI) and machine learning (ML) are transforming industries worldwide. 
These technologies enable computers to learn from data and make decisions without explicit programming.

Key applications include:
- Natural language processing for chatbots and virtual assistants
- Computer vision for image recognition and autonomous vehicles
- Predictive analytics for business intelligence

However, concerns about AI ethics, bias, and job displacement remain significant challenges 
that society must address as these technologies continue to evolve.
`;

async function testParsing() {
  console.log('=================================');
  console.log('Testing Gemini Response Parsing');
  console.log('=================================\n');
  
  try {
    const prompt = `Analyze the following article and provide a structured response in JSON format.

Article:
${testArticle}

Please provide:
1. Three related articles (with realistic titles and URLs from reputable sources)
2. Definitions for these key terms: AI, Machine Learning, Natural Language Processing
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

    console.log('Calling Gemini API...\n');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    console.log('=== Raw Gemini Response ===');
    console.log(responseText);
    console.log('=== End Raw Response ===\n');
    
    // Parse the response
    const parsed = parseGeminiResponse(responseText);
    
    console.log('\n=== Parsed and Validated Result ===');
    console.log(JSON.stringify(parsed, null, 2));
    console.log('=== End Result ===\n');
    
    // Verify structure
    console.log('=== Structure Verification ===');
    console.log('✓ Has relatedArticles:', Array.isArray(parsed.relatedArticles));
    console.log('✓ Has definitions:', Array.isArray(parsed.definitions));
    console.log('✓ Has arguments.main:', Array.isArray(parsed.arguments?.main));
    console.log('✓ Has arguments.counter:', Array.isArray(parsed.arguments?.counter));
    
    console.log('\n✅ Parsing test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testParsing();
