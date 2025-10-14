// Unit tests for parseGeminiResponse function
// These tests don't require API calls

// Copy of parseGeminiResponse function from server.js
function parseGeminiResponse(text) {
  // Try to extract JSON from markdown code blocks (```json...```)
  const jsonCodeBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonCodeBlockMatch) {
    try {
      const parsed = JSON.parse(jsonCodeBlockMatch[1]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      // Continue to next parsing strategy
    }
  }
  
  // Try to extract JSON from generic code blocks (```...```)
  const codeBlockMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      // Continue to next parsing strategy
    }
  }
  
  // Try to find JSON object in the text (look for {...})
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      return validateAndNormalizeResponse(parsed);
    } catch (error) {
      // Continue to next parsing strategy
    }
  }
  
  // Try to parse the entire text as JSON
  try {
    const parsed = JSON.parse(text);
    return validateAndNormalizeResponse(parsed);
  } catch (error) {
    // Continue to fallback
  }
  
  // Fallback: return structured response with raw text
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
  
  return {
    relatedArticles,
    definitions,
    arguments: {
      main: mainArguments,
      counter: counterArguments
    }
  };
}

// Test cases
const testCases = [
  {
    name: 'JSON in markdown code block',
    input: `Here is the analysis:

\`\`\`json
{
  "relatedArticles": [
    {"title": "AI Trends 2024", "url": "https://example.com/ai-trends"},
    {"title": "ML Basics", "url": "https://example.com/ml-basics"}
  ],
  "definitions": [
    {"term": "AI", "definition": "Artificial Intelligence"}
  ],
  "arguments": {
    "main": ["AI is transforming industries"],
    "counter": ["AI poses ethical challenges"]
  }
}
\`\`\`

That's the analysis.`,
    expectedArticles: 2,
    expectedDefinitions: 1,
    expectedMainArgs: 1,
    expectedCounterArgs: 1
  },
  {
    name: 'JSON in generic code block',
    input: `\`\`\`
{
  "relatedArticles": [{"title": "Test", "url": "https://test.com"}],
  "definitions": [],
  "arguments": {"main": [], "counter": []}
}
\`\`\``,
    expectedArticles: 1,
    expectedDefinitions: 0,
    expectedMainArgs: 0,
    expectedCounterArgs: 0
  },
  {
    name: 'Plain JSON object',
    input: `{"relatedArticles": [{"title": "Article", "url": "https://example.com"}], "definitions": [{"term": "Test", "definition": "A test"}], "arguments": {"main": ["Main point"], "counter": []}}`,
    expectedArticles: 1,
    expectedDefinitions: 1,
    expectedMainArgs: 1,
    expectedCounterArgs: 0
  },
  {
    name: 'JSON with extra text',
    input: `Some text before {"relatedArticles": [], "definitions": [], "arguments": {"main": ["Point"], "counter": []}} and after`,
    expectedArticles: 0,
    expectedDefinitions: 0,
    expectedMainArgs: 1,
    expectedCounterArgs: 0
  },
  {
    name: 'Invalid JSON - fallback',
    input: `This is not JSON at all, just plain text response from the model.`,
    expectedArticles: 0,
    expectedDefinitions: 0,
    expectedMainArgs: 1, // Fallback creates one main argument
    expectedCounterArgs: 0
  },
  {
    name: 'JSON with whitespace in values',
    input: `{"relatedArticles": [{"title": "  Spaced Title  ", "url": "  https://example.com  "}], "definitions": [{"term": "  Term  ", "definition": "  Definition  "}], "arguments": {"main": ["  Argument  "], "counter": []}}`,
    expectedArticles: 1,
    expectedDefinitions: 1,
    expectedMainArgs: 1,
    expectedCounterArgs: 0
  },
  {
    name: 'JSON with invalid entries mixed with valid',
    input: `{"relatedArticles": [{"title": "Valid", "url": "https://valid.com"}, {"title": "", "url": "https://invalid.com"}, {"title": "Also Valid", "url": "https://valid2.com"}], "definitions": [{"term": "Valid", "definition": "Good"}, {"term": "", "definition": "Bad"}], "arguments": {"main": ["Good", "", "Also Good"], "counter": []}}`,
    expectedArticles: 2, // Only valid entries
    expectedDefinitions: 1, // Only valid entries
    expectedMainArgs: 2, // Only non-empty strings
    expectedCounterArgs: 0
  }
];

// Run tests
console.log('=================================');
console.log('Running Parsing Unit Tests');
console.log('=================================\n');

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  
  try {
    const result = parseGeminiResponse(testCase.input);
    
    // Verify structure
    const hasCorrectStructure = 
      Array.isArray(result.relatedArticles) &&
      Array.isArray(result.definitions) &&
      result.arguments &&
      Array.isArray(result.arguments.main) &&
      Array.isArray(result.arguments.counter);
    
    if (!hasCorrectStructure) {
      throw new Error('Invalid structure');
    }
    
    // Verify counts
    const articlesMatch = result.relatedArticles.length === testCase.expectedArticles;
    const definitionsMatch = result.definitions.length === testCase.expectedDefinitions;
    const mainArgsMatch = result.arguments.main.length === testCase.expectedMainArgs;
    const counterArgsMatch = result.arguments.counter.length === testCase.expectedCounterArgs;
    
    if (!articlesMatch || !definitionsMatch || !mainArgsMatch || !counterArgsMatch) {
      throw new Error(`Count mismatch: articles=${result.relatedArticles.length} (expected ${testCase.expectedArticles}), definitions=${result.definitions.length} (expected ${testCase.expectedDefinitions}), main=${result.arguments.main.length} (expected ${testCase.expectedMainArgs}), counter=${result.arguments.counter.length} (expected ${testCase.expectedCounterArgs})`);
    }
    
    // Verify whitespace trimming (if applicable)
    if (testCase.name.includes('whitespace')) {
      const hasUntrimmed = 
        result.relatedArticles.some(a => a.title !== a.title.trim() || a.url !== a.url.trim()) ||
        result.definitions.some(d => d.term !== d.term.trim() || d.definition !== d.definition.trim()) ||
        result.arguments.main.some(arg => arg !== arg.trim()) ||
        result.arguments.counter.some(arg => arg !== arg.trim());
      
      if (hasUntrimmed) {
        throw new Error('Values not properly trimmed');
      }
    }
    
    console.log(`  ✅ PASSED`);
    console.log(`     Articles: ${result.relatedArticles.length}, Definitions: ${result.definitions.length}, Main: ${result.arguments.main.length}, Counter: ${result.arguments.counter.length}\n`);
    passed++;
    
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
    failed++;
  }
});

console.log('=================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
}
