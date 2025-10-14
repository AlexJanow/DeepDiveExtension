/**
 * Content Script for DeepDive Assistant
 * Extracts article text from web pages using cascading selector strategy
 */

// Cascading selector strategy - prioritize semantic elements
const EXTRACTION_SELECTORS = [
  'article',                    // Semantic article tag
  '[role="article"]',           // ARIA article role
  '.article-content',           // Common class names
  '.post-content',
  'main',                       // Main content area
  'body'                        // Fallback
];

const MIN_TEXT_LENGTH = 100;

/**
 * Extract article text from the page using cascading selector strategy
 * @returns {string} Extracted article text
 */
function extractArticleText() {
  // Try each selector in priority order
  for (const selector of EXTRACTION_SELECTORS) {
    const element = document.querySelector(selector);
    if (element && element.innerText.trim().length >= MIN_TEXT_LENGTH) {
      return element.innerText.trim();
    }
  }
  
  // Fallback to body if no suitable element found
  const bodyText = document.body.innerText.trim();
  return bodyText.length >= MIN_TEXT_LENGTH ? bodyText : '';
}

/**
 * Check if content has changed (for dynamic content detection)
 */
let lastExtractedText = '';
let contentChangeTimeout = null;

function setupDynamicContentObserver() {
  // MutationObserver for SPAs that load content after document_idle
  const observer = new MutationObserver((_mutations) => {
    // Debounce content changes
    if (contentChangeTimeout) {
      clearTimeout(contentChangeTimeout);
    }
    
    contentChangeTimeout = setTimeout(() => {
      const currentText = extractArticleText();
      if (currentText && currentText !== lastExtractedText) {
        lastExtractedText = currentText;
        // Content has changed, cache will be invalidated on next request
      }
    }, 1000); // Wait 1 second after last mutation
  });
  
  // Observe changes to main content areas
  const targetNode = document.querySelector('main') || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// Set up observer for dynamic content
setupDynamicContentObserver();

/**
 * Message listener for communication with popup
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TEXT') {
    try {
      const text = extractArticleText();
      const url = window.location.href;
      
      // Validate minimum text length
      if (text.length < MIN_TEXT_LENGTH) {
        sendResponse({
          success: false,
          error: 'No article content found on this page.',
          text: '',
          url: url
        });
      } else {
        lastExtractedText = text;
        sendResponse({
          success: true,
          text: text,
          url: url
        });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        text: '',
        url: window.location.href
      });
    }
  }
  
  // Return true to indicate async response
  return true;
});
