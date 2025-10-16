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
  '.story-body',
  'main',                       // Main content area
  'body'                        // Fallback (filtered)
];

// Exclude non-content areas (sidebars, nav, promos, ads, etc.)
const EXCLUDE_SELECTORS = [
  'header', 'nav', 'footer', 'aside',
  '[role="complementary"]', '[aria-label="sidebar"]',
  '.sidebar', '.related', '.most-read', '.trending', '.promo', '.newsletter',
  '.ad', '[class*="ad-"]', '[id*="ad-"]', '.banner', '.outbrain', '.share', '.comments'
].join(',');

function textLengthExcludingNoise(element) {
  try {
    const clone = element.cloneNode(true);
    if (EXCLUDE_SELECTORS) {
      clone.querySelectorAll(EXCLUDE_SELECTORS).forEach(n => n.remove());
    }
    const text = clone.innerText || '';
    return text.trim().length;
  } catch {
    return (element.innerText || '').trim().length;
  }
}

const MIN_TEXT_LENGTH = 100;

/**
 * Extract article text from the page using cascading selector strategy
 * @returns {string} Extracted article text
 */
function extractArticleText() {
  // Collect candidates for each selector and score by visible text length (excluding noise)
  const seen = new Set();
  /** @type {HTMLElement[]} */
  const candidates = [];
  for (const selector of EXTRACTION_SELECTORS) {
    document.querySelectorAll(selector).forEach(el => {
      if (el && el instanceof HTMLElement && !seen.has(el)) {
        seen.add(el);
        candidates.push(el);
      }
    });
  }

  function scoreElement(el) {
    const len = textLengthExcludingNoise(el);
    let score = len;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'article') score += 50000;
    if (el.getAttribute && el.getAttribute('role') === 'article') score += 40000;
    if (el.querySelector && el.querySelector('h1')) score += 5000;
    if (tag === 'body') score -= 20000;
    if (tag === 'main') score -= 5000;
    return { score, len };
  }

  let best = null;
  let bestMetrics = { score: 0, len: 0 };
  for (const el of candidates) {
    const metrics = scoreElement(el);
    if (metrics.score > bestMetrics.score) {
      best = el;
      bestMetrics = metrics;
    }
  }

  if (best && bestMetrics.len >= MIN_TEXT_LENGTH) {
    // Prefer concatenation of paragraph text to avoid navigation noise
    const paras = Array.from(best.querySelectorAll('p'))
      .map(p => (p.innerText || '').trim())
      .filter(t => t.length >= 40);
    let combined = paras.join('\n\n');

    // If paragraphs extraction is too short, fallback to cleaned innerText
    if (combined.length < MIN_TEXT_LENGTH) {
      const clone = best.cloneNode(true);
      if (EXCLUDE_SELECTORS) {
        clone.querySelectorAll(EXCLUDE_SELECTORS).forEach(n => n.remove());
      }
      combined = (clone.innerText || '').trim();
    }

    // Cap extreme lengths by trimming to ~60k chars preserving boundaries
    const MAX_TEXT = 60000;
    if (combined.length > MAX_TEXT) {
      const truncated = combined.slice(0, MAX_TEXT);
      const lastPeriod = truncated.lastIndexOf('.')
      combined = lastPeriod > 1000 ? truncated.slice(0, lastPeriod + 1) : truncated;
    }

    return combined;
  }

  // Fallback to filtered body text
  const bodyClone = document.body.cloneNode(true);
  if (EXCLUDE_SELECTORS) {
    bodyClone.querySelectorAll(EXCLUDE_SELECTORS).forEach(n => n.remove());
  }
  const bodyText = (bodyClone.innerText || '').trim();
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
      const pageTitle = document.title || '';
      const h1 = document.querySelector('h1');
      const heading = h1 ? (h1.innerText || '').trim() : '';
      
      // Validate minimum text length
      if (text.length < MIN_TEXT_LENGTH) {
        sendResponse({
          success: false,
          error: 'No article content found on this page.',
          text: '',
          url: url,
          title: pageTitle,
          heading
        });
      } else {
        lastExtractedText = text;
        sendResponse({
          success: true,
          text: text,
          url: url,
          title: pageTitle,
          heading
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
