# Deep Dive Analysis Testing Guide

This guide provides step-by-step instructions for testing the Deep Dive Analysis feature.

## Prerequisites

### 1. Backend Setup

The backend server must be running with a valid Gemini API key.

```bash
# Navigate to backend directory
cd backend

# Create .env file if it doesn't exist
cp .env.example .env

# Edit .env and add your Gemini API key
# GEMINI_API_KEY=your_actual_api_key_here

# Install dependencies (if not already done)
npm install

# Start the backend server
npm run dev
```

You should see:
```
DeepDive Assistant backend running on port 3001
Environment: development
CORS enabled for chrome-extension:// origins
```

### 2. Extension Build

Build the extension to ensure all changes are included.

```bash
# Navigate to extension directory
cd extension

# Install dependencies (if not already done)
npm install

# Build the extension
npm run build
```

You should see:
```
Build complete!
```

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Navigate to and select the `extension/dist` folder
5. The DeepDive Assistant extension should now appear in your extensions list

## Test Scenarios

### Test 1: Basic Deep Dive Analysis

**Objective**: Verify that deep dive analysis works with a standard article.

**Steps**:
1. Open the test article: `file:///path/to/extension/test-analysis.html`
   - Or navigate to any news article online (e.g., BBC, NYTimes, Medium)
2. Click the DeepDive Assistant extension icon in the toolbar
3. Click the "🧠 Deep Dive Analysis" button
4. Wait for the analysis to complete (5-20 seconds)

**Expected Results**:
- ✅ Loading spinner appears immediately
- ✅ Spinner disappears when analysis completes
- ✅ Results display with the following sections:
  - 📚 Related Articles (with 3 clickable links)
  - 📖 Key Terms (with definitions)
  - ✅ Main Arguments (list of arguments)
  - ⚖️ Counter Arguments (list of counter-arguments)
- ✅ All sections have proper formatting and styling
- ✅ No errors in console

**Console Output**:
```
Starting deep dive analysis...
Article length: XXXX characters
Analysis complete: {
  relatedArticles: 3,
  definitions: X,
  mainArguments: X,
  counterArguments: X
}
```

### Test 2: Link Functionality

**Objective**: Verify that related article links work correctly.

**Steps**:
1. Complete Test 1 to get analysis results
2. Click on one of the related article links

**Expected Results**:
- ✅ Link opens in a new tab
- ✅ Original tab remains on the same page
- ✅ New tab navigates to the linked URL
- ✅ No security warnings or errors

### Test 3: Network Error Handling

**Objective**: Verify error handling when backend is unavailable.

**Steps**:
1. Stop the backend server (Ctrl+C in the terminal)
2. Navigate to any article page
3. Click the extension icon
4. Click "🧠 Deep Dive Analysis" button

**Expected Results**:
- ✅ Loading spinner appears
- ✅ Error message appears after timeout:
  - "Unable to connect to analysis service. Please check your internet connection and ensure the backend server is running."
- ✅ Retry button (🔄 Retry) is displayed
- ✅ Error has red background and border

**Recovery Steps**:
1. Restart the backend server: `npm run dev`
2. Click the "🔄 Retry" button in the error message

**Expected Results**:
- ✅ Analysis completes successfully
- ✅ Results are displayed

### Test 4: Empty Content Handling

**Objective**: Verify handling of pages with no extractable content.

**Steps**:
1. Navigate to a page with minimal text (e.g., `chrome://extensions/`)
2. Click the extension icon
3. Click "🧠 Deep Dive Analysis" button

**Expected Results**:
- ✅ Error message appears:
  - "No article content found on this page. Try navigating to an article."
- ✅ No retry button (error is not recoverable)
- ✅ No network request is made to backend

### Test 5: Long Article Handling

**Objective**: Verify handling of very long articles.

**Steps**:
1. Navigate to a long article (e.g., Wikipedia article, long blog post)
2. Click the extension icon
3. Click "🧠 Deep Dive Analysis" button
4. Wait for analysis to complete

**Expected Results**:
- ✅ Analysis completes successfully (may take longer)
- ✅ Results are displayed
- ✅ No errors or warnings
- ✅ Backend handles large text without issues

### Test 6: Multiple Analyses

**Objective**: Verify that multiple analyses can be performed in sequence.

**Steps**:
1. Navigate to article A
2. Perform deep dive analysis
3. Wait for results
4. Navigate to article B
5. Perform deep dive analysis again
6. Wait for results

**Expected Results**:
- ✅ Both analyses complete successfully
- ✅ Results are different for each article
- ✅ No memory leaks or performance degradation
- ✅ No errors in console

### Test 7: Instant Summary + Deep Dive

**Objective**: Verify both features work together.

**Steps**:
1. Navigate to an article
2. Click "⚡ Instant Summary" button
3. Wait for summary to appear
4. Click "🧠 Deep Dive Analysis" button
5. Wait for analysis to appear

**Expected Results**:
- ✅ Instant summary completes first
- ✅ Deep dive analysis replaces summary in output area
- ✅ Both features work independently
- ✅ No conflicts or errors

### Test 8: XSS Prevention

**Objective**: Verify that malicious content is properly escaped.

**Steps**:
1. Create a test HTML file with malicious content:
```html
<article>
  <h1>Test Article with <script>alert('XSS')</script></h1>
  <p>Content with <img src=x onerror="alert('XSS')"> tag</p>
</article>
```
2. Open the test file in Chrome
3. Perform deep dive analysis

**Expected Results**:
- ✅ No JavaScript alerts appear
- ✅ Script tags are escaped in output
- ✅ HTML tags are properly escaped
- ✅ Content is displayed as text, not executed

### Test 9: Backend Error Responses

**Objective**: Verify handling of various backend error responses.

**Steps**:
1. Modify backend to return 500 error (temporarily)
2. Perform deep dive analysis

**Expected Results**:
- ✅ Error message appears: "Server error occurred. Please try again later."
- ✅ Retry button is shown
- ✅ Error is logged to console

**Note**: You can test different error codes by modifying the backend temporarily.

### Test 10: Console Logging

**Objective**: Verify that useful debugging information is logged.

**Steps**:
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Perform deep dive analysis

**Expected Results**:
- ✅ "Starting deep dive analysis..." message
- ✅ Article length logged
- ✅ "Analysis complete:" with result counts
- ✅ No error messages (unless errors occur)
- ✅ Logs are clear and informative

## Troubleshooting

### Backend Not Starting

**Problem**: Backend fails to start with "GEMINI_API_KEY is not set"

**Solution**:
1. Ensure `.env` file exists in `backend/` directory
2. Verify `GEMINI_API_KEY` is set in `.env`
3. Get API key from https://makersuite.google.com/app/apikey

### Extension Not Loading

**Problem**: Extension fails to load in Chrome

**Solution**:
1. Ensure you built the extension: `npm run build`
2. Load the `dist` folder, not the root `extension` folder
3. Check for errors in `chrome://extensions/`
4. Try removing and re-adding the extension

### Analysis Fails Immediately

**Problem**: Analysis fails with network error immediately

**Solution**:
1. Verify backend is running: `curl http://localhost:3001/health`
2. Check backend console for errors
3. Verify CORS is configured correctly
4. Check Chrome DevTools Network tab for failed requests

### No Results Displayed

**Problem**: Analysis completes but no results shown

**Solution**:
1. Check Chrome DevTools Console for errors
2. Verify backend is returning valid JSON
3. Check Network tab to see backend response
4. Verify `renderAnalysisResults()` is being called

### Links Don't Work

**Problem**: Related article links don't open

**Solution**:
1. Check if links have `href` attribute
2. Verify URLs are valid
3. Check browser popup blocker settings
4. Verify `target="_blank"` is present

## Performance Benchmarks

Expected performance metrics:

- **Analysis Time**: 5-20 seconds (depends on article length and API response time)
- **Memory Usage**: < 50MB
- **Network Request Size**: < 100KB (article text)
- **Network Response Size**: < 10KB (JSON response)

## Success Criteria

All tests should pass with the following results:

- ✅ Deep dive analysis completes successfully
- ✅ Results are formatted and displayed correctly
- ✅ Links work and open in new tabs
- ✅ Error handling works for all error types
- ✅ Retry functionality works
- ✅ No XSS vulnerabilities
- ✅ No console errors (except expected error logs)
- ✅ Performance is acceptable
- ✅ Multiple analyses work without issues

## Reporting Issues

If you encounter any issues during testing:

1. Note the exact steps to reproduce
2. Capture console errors (if any)
3. Capture network requests (DevTools Network tab)
4. Note the article URL being tested
5. Include backend logs (if relevant)
6. Document expected vs actual behavior

## Next Steps

After successful testing:

1. Proceed to Task 15: Add privacy and data handling features
2. Consider adding caching for analysis results
3. Make backend URL configurable
4. Add more comprehensive error messages
5. Implement analytics/telemetry (optional)
