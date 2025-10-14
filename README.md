# DeepDive Assistant

Intelligent article analysis Chrome Extension with instant summaries and deep research capabilities.

## Project Structure

```
.
├── extension/          # Chrome Extension code
│   ├── src/           # Source files
│   ├── icons/         # Extension icons
│   ├── dist/          # Built extension (generated)
│   ├── manifest.json  # Extension manifest
│   ├── build.js       # Build script
│   └── package.json   # Extension dependencies
│
└── backend/           # Backend service
    ├── server.js      # Express server
    ├── package.json   # Backend dependencies
    └── .env           # Environment variables (create from .env.example)
```

## Setup

### Extension

```bash
cd extension
npm install
npm run build
```

Load the extension in Chrome:
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` directory

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your Gemini API key
npm start
```

## Development

### Extension
```bash
cd extension
npm run watch  # Watch mode for development
```

### Backend
```bash
cd backend
npm run dev  # Auto-restart on changes
```

## Requirements

- Chrome Canary or Beta with AI features enabled (for Summarizer API)
- Node.js 18+ (for backend)
- Gemini API key (for deep dive analysis)

## Features

- **Instant Summary**: Client-side summarization using Chrome's built-in Summarizer API
- **Deep Dive Analysis**: Server-side analysis with Google Search grounding for real, verifiable related article URLs, plus definitions and arguments
- **Privacy-First**: Local processing for summaries, clear communication about data handling
- **Smart Caching**: Both Instant Summary and Deep Dive results are cached locally to reduce redundant API calls

## License

MIT
