// Service Worker for DeepDive Assistant
// Handles extension lifecycle events and message routing

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('DeepDive Assistant installed');
    
    // Initialize default settings in chrome.storage.local
    chrome.storage.local.set({
      summaryType: 'key-points',
      summaryLength: 'medium',
      summaryFormat: 'markdown'
    }, () => {
      console.log('Default settings initialized');
    });
  } else if (details.reason === 'update') {
    console.log('DeepDive Assistant updated to version', chrome.runtime.getManifest().version);
  }
});

// Message routing infrastructure for future enhancements
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Route messages between components if needed
  // This infrastructure is ready for future features like:
  // - Context menu integration
  // - Background processing
  // - Cross-component communication
  
  console.log('Background received message:', message.type);
  
  // Keep channel open for async responses
  return true;
});

// Log service worker activation
console.log('DeepDive Assistant service worker activated');
