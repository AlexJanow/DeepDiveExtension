# Build Documentation

## Overview

The DeepDive Assistant extension uses esbuild for fast, efficient bundling and minification. The build process bundles all JavaScript dependencies locally, minifies code for production, and generates source maps for debugging.

## Build Scripts

### Development Build
```bash
npm run build
```
- Bundles JavaScript files with esbuild
- Minifies JavaScript and CSS
- Generates source maps for debugging
- Copies static assets (HTML, manifest, icons)
- Output: `dist/` directory

### Production Build
```bash
npm run build:prod
```
- Same as development build but explicitly sets NODE_ENV=production
- Enables aggressive minification
- Removes comments and unused code
- Tree-shaking for smaller bundle size

### Watch Mode
```bash
npm run watch
```
- Watches for file changes and rebuilds automatically
- Skips minification for faster rebuilds
- Useful during development

### Clean Build
```bash
npm run clean
```
- Removes the `dist/` directory
- Use before a fresh build

## Build Output

The build process creates the following structure in `dist/`:

```
dist/
├── background.js          # Bundled service worker
├── background.js.map      # Source map for debugging
├── content.js             # Bundled content script
├── content.js.map         # Source map for debugging
├── popup.js               # Bundled popup script
├── popup.js.map           # Source map for debugging
├── popup.css              # Minified CSS
├── popup.html             # Popup HTML
├── manifest.json          # Extension manifest
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    └── icon.svg
```

## Build Features

### 1. JavaScript Bundling
- **Tool**: esbuild
- **Format**: IIFE (Immediately Invoked Function Expression)
- **Target**: Chrome 120+
- **Features**:
  - All dependencies bundled locally (no runtime downloads)
  - Tree-shaking to remove unused code
  - Minification in production mode
  - Source maps for debugging

### 2. CSS Processing
- Simple minification that removes:
  - Comments
  - Extra whitespace
  - Unnecessary characters
- Preserves functionality while reducing file size

### 3. Asset Copying
- Copies static files to dist directory:
  - HTML files
  - Manifest
  - Icons (PNG and SVG)

### 4. Source Maps
- Generated for all JavaScript files
- Enables debugging of minified code
- Maps back to original source files

## Loading the Extension

### Development
1. Build the extension: `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist/` directory

### Production
1. Build for production: `npm run build:prod`
2. The `dist/` directory contains the production-ready extension
3. Can be packaged and submitted to Chrome Web Store

## File Sizes

Typical build output sizes:
- `popup.js`: ~13KB (minified)
- `content.js`: ~877B (minified)
- `background.js`: ~587B (minified)
- `popup.css`: ~7.6KB (minified)
- Total: ~22KB (excluding icons)

## Troubleshooting

### Build Fails
- Ensure Node.js is installed (v16+)
- Run `npm install` to install dependencies
- Check for syntax errors in source files

### Extension Doesn't Load
- Verify all files are in `dist/` directory
- Check Chrome console for errors
- Ensure manifest.json is valid

### Source Maps Not Working
- Ensure source maps are enabled in Chrome DevTools
- Check that `.map` files exist in `dist/`
- Verify file paths in source maps

## Development Workflow

1. Make changes to source files
2. Run `npm run watch` for automatic rebuilds
3. Reload extension in Chrome (click reload button in chrome://extensions/)
4. Test changes
5. Repeat

For production deployment:
1. Run `npm run build:prod`
2. Test the production build
3. Package the `dist/` directory
4. Submit to Chrome Web Store
