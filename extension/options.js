// DeepDive Assistant - Options Page Script

/**
 * SettingsManager handles user preferences
 */
class SettingsManager {
  constructor() {
    this.storage = chrome.storage.sync;
    this.defaults = {
      queryGenerationMode: 'immediate' // 'immediate' or 'on-demand'
    };
  }
  
  async get(key) {
    const result = await this.storage.get(key);
    return result[key] ?? this.defaults[key];
  }
  
  async set(key, value) {
    await this.storage.set({ [key]: value });
  }
  
  async getAll() {
    const result = await this.storage.get(null);
    return { ...this.defaults, ...result };
  }
}

// Initialize settings manager
const settings = new SettingsManager();
const checkbox = document.getElementById('immediateQueryGen');
const statusDiv = document.getElementById('status');

// Load current setting
async function loadSettings() {
  try {
    const mode = await settings.get('queryGenerationMode');
    checkbox.checked = (mode === 'immediate');
    console.log('Loaded setting:', mode);
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

// Save setting on change
async function saveSettings() {
  try {
    const mode = checkbox.checked ? 'immediate' : 'on-demand';
    await settings.set('queryGenerationMode', mode);
    console.log('Saved setting:', mode);
    showStatus('Settings saved!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

// Show status message
function showStatus(message, type = 'success') {
  statusDiv.textContent = message;
  statusDiv.className = `status-message ${type}`;
  statusDiv.hidden = false;
  
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.hidden = true;
    }, 2000);
  }
}

// Event listeners
checkbox.addEventListener('change', saveSettings);

// Load settings when page loads
document.addEventListener('DOMContentLoaded', loadSettings);

