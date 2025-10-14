import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set');
  process.exit(1);
}

console.log('Testing Gemini API integration...\n');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure model
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: 'You are a research assistant that analyzes articles and provides structured insights. Your responses must be in valid JSON format.'
});

// Build test prompt
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

// Test article
const testArticle = `
Artificial Intelligence and Machine Learning in Healthcare

The integration of artificial intelligence (AI) and machine learning (ML) into healthcare systems is transforming how medical professionals diagnose diseases, develop treatment plans, and manage patient care. These technologies analyze vast amounts of medical data to identify patterns that humans might miss.

One of the most promising applications is in medical imaging. AI algorithms can now detect cancerous tumors in X-rays and MRIs with accuracy comparable to experienced radiologists. This not only speeds up diagnosis but also helps catch diseases in their early stages when they're most treatable.

However, concerns remain about data privacy, algorithmic bias, and the potential for over-reliance on automated systems. Critics argue that AI should augment, not replace, human medical expertise.
`;

async function testGeminiIntegration() {
  try {
    console.log('Building prompt...');
    const prompt = buildAnalysisPrompt(testArticle, ['AI', 'machine learning', 'healthcare']);
    
    console.log('Calling Gemini API...');
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    const responseText = result.response.text();
    console.log(`\nAPI call completed in ${duration}ms\n`);
    
    console.log('Raw response:');
    console.log(responseText);
    console.log('\n---\n');
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(responseText);
      console.log('✓ Successfully parsed as JSON');
      console.log('\nParsed structure:');
      console.log('- Related Articles:', parsed.relatedArticles?.length || 0);
      console.log('- Definitions:', parsed.definitions?.length || 0);
      console.log('- Main Arguments:', parsed.arguments?.main?.length || 0);
      console.log('- Counter Arguments:', parsed.arguments?.counter?.length || 0);
      console.log('\nFull parsed response:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.log('✗ Failed to parse as JSON');
      console.log('Parse error:', parseError.message);
    }
    
  } catch (error) {
    console.error('Error testing Gemini API:');
    console.error('Message:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
    process.exit(1);
  }
}

testGeminiIntegration();
