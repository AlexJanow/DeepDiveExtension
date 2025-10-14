# Privacy Policy - DeepDive Assistant

**Last Updated:** December 2024

## Overview

DeepDive Assistant is designed with privacy as a core principle. This document explains how the extension handles your data and what information is processed locally versus sent to external services.

## Data Collection & Processing

### What Data We Process

The extension processes the following data:
- **Article text** from web pages you visit (only when you click a button)
- **Page URLs** for caching purposes
- **Generated summaries and analyses** stored locally in your browser

### What Data We DO NOT Collect

- We do NOT collect personal information
- We do NOT track your browsing history
- We do NOT store data on external servers
- We do NOT use analytics or tracking tools
- We do NOT share data with third parties (except as described below for Deep Dive Analysis)

## Feature-Specific Privacy

### ⚡ Instant Summary (100% Local Processing)

**How it works:**
- Uses Chrome's built-in Summarizer API
- All processing happens on your device
- **NO data is sent to external servers**
- Results are cached locally in your browser

**Data storage:**
- Summaries are stored in `chrome.storage.local`
- Cache is automatically cleared when you uninstall the extension
- No data leaves your device

### 🧠 Deep Dive Analysis (Cloud-Based Processing)

**How it works:**
- Sends article text to our backend service
- Backend uses Google's Gemini API for analysis
- Results are returned to your browser

**Data transmission:**
- Article text is sent via **HTTPS** (encrypted connection)
- Only sent when you explicitly click "Deep Dive Analysis"
- Connection is secure and encrypted

**Data retention:**
- Article text is NOT stored on our servers
- Processed by Gemini API according to [Google's AI Terms](https://ai.google.dev/terms)
- No permanent logs of article content

## Third-Party Services

### Google Gemini API

When you use Deep Dive Analysis, article text is sent to Google's Gemini API for processing. This is governed by:
- [Google AI Terms of Service](https://ai.google.dev/terms)
- [Google Privacy Policy](https://policies.google.com/privacy)

### Chrome Built-in AI (Summarizer API)

Instant Summary uses Chrome's experimental Summarizer API:
- Processing happens entirely on your device
- Subject to [Chrome's Privacy Policy](https://www.google.com/chrome/privacy/)
- No data sent to Google servers

## Data Storage

### Local Storage (chrome.storage.local)

We store the following data locally in your browser:
- Cached summaries (with expiration timestamps)
- User preferences (summary type, length, format)

**Automatic cleanup:**
- All local data is automatically deleted when you uninstall the extension
- Cache entries expire after 24 hours
- You can clear cache manually by reinstalling the extension

### No External Storage

- We do NOT use external databases
- We do NOT store data in the cloud
- We do NOT sync data across devices

## Permissions

The extension requests the following permissions:

### `activeTab`
- **Purpose:** Extract article text from the current page
- **Scope:** Only when you click a button
- **Data access:** Read-only access to page content

### `storage`
- **Purpose:** Cache summaries locally
- **Scope:** Local browser storage only
- **Data access:** Stored on your device only

## Security Measures

### HTTPS Enforcement

- Deep Dive Analysis requires HTTPS connection to backend
- HTTP is only allowed for localhost during development
- All data transmission is encrypted

### No Tracking

- No analytics or tracking scripts
- No user identification
- No behavioral tracking

### Minimal Permissions

- Only requests necessary permissions
- No access to browsing history
- No access to other websites

## Your Rights

### Data Access

- All your data is stored locally in your browser
- You can view cached data using Chrome DevTools

### Data Deletion

- Uninstall the extension to delete all data
- Reinstall to clear cache manually
- No data remains after uninstallation

### Opt-Out

- Don't use Deep Dive Analysis if you don't want to send data externally
- Instant Summary works completely offline

## Changes to Privacy Policy

We may update this privacy policy from time to time. Changes will be reflected in the extension and on our GitHub repository.

## Contact

For privacy concerns or questions:
- Open an issue on our [GitHub repository](https://github.com/yourusername/deepdive-assistant)
- Email: [your-email@example.com]

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

## Summary

**In short:**
- ⚡ Instant Summary = 100% local, no data sent anywhere
- 🧠 Deep Dive = Sends article to our backend via HTTPS
- 🔒 All data deleted when you uninstall
- 🚫 No tracking, no analytics, no data collection
- ✅ You're in control of your data
