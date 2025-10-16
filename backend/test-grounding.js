import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set in environment variables');
  process.exit(1);
}

console.log('Testing Gemini API Google Search Grounding...\n');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure model with system instructions
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  systemInstruction: 'You are a research assistant that finds related articles using Google Search.'
});

// Test article about ACA subsidies (from user's BBC article)
const testArticle = `
'A lifeline' - Americans fear spike in healthcare costs, making some Republicans nervy

For the past few weeks, Shana Verstegen has been "sick to her stomach" wondering what might happen to her family's health insurance next year.

Ms Verstegen and her husband both work for a small business as fitness trainers, meaning they have to pay for their own plan.

The Wisconsin parents of two have saved an estimated $800 (£601) a month on their health insurance through Affordable Care Act, also known as Obamacare, premium tax credits.

Set to expire at the end of the year, the federal subsidies are now at the heart of the battle over the US shutdown. Democrats will not back a spending deal that reopens the government unless Republicans renew the subsidies.
`;

async function testGrounding() {
  try {
    console.log('Building prompt with Google Search grounding...');
    
    const prompt = `Find 3 real, existing related articles about this topic using Google Search:

${testArticle}

IMPORTANT: Use Google Search to find actual articles. Return URLs that you have found through search, not fabricated ones.

Return a simple list of articles you found.`;

    console.log('\nCalling Gemini API with Google Search tool...');
    const startTime = Date.now();
    
    // Call with Google Search grounding tool
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: prompt }] }
      ],
      tools: [{ google_search: {} }]
    });
    
    const duration = Date.now() - startTime;
    console.log(`API call completed in ${duration}ms\n`);
    
    // Extract grounding metadata
    const candidate = result.response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    
    console.log('=== GROUNDING METADATA ===');
    console.log('Has metadata:', !!groundingMetadata);
    console.log('Chunk count:', groundingMetadata?.groundingChunks?.length || 0);
    console.log('Web search queries:', groundingMetadata?.webSearchQueries || []);
    console.log('\n=== GROUNDING CHUNKS ===');
    
    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk, index) => {
        if (chunk.web) {
          console.log(`\nChunk ${index + 1}:`);
          console.log('  Title:', chunk.web.title || 'N/A');
          console.log('  URI:', chunk.web.uri || 'N/A');
        }
      });
    } else {
      console.log('No grounding chunks found!');
    }
    
    console.log('\n=== RESPONSE TEXT ===');
    const responseText = result.response.text();
    console.log(responseText);
    
    console.log('\n=== TEST RESULT ===');
    if (groundingMetadata?.groundingChunks?.length > 0) {
      console.log('✅ SUCCESS: Grounding is working! Found', groundingMetadata.groundingChunks.length, 'grounded sources');
    } else {
      console.log('❌ FAILURE: No grounding chunks found. Google Search tool may not be working properly.');
    }
    
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testGrounding();



