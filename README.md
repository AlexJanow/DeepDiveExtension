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
PORT=3001 npm start
```

## Judge Quick Start

1. **Install Chrome Canary or Chrome Beta** and enable Chrome's built-in AI features (Summarizer API) via `chrome://flags` if required.
2. **Start the backend locally:**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Add GEMINI_API_KEY to .env
   PORT=3001 npm start
   ```
   The server listens on `http://localhost:3001` and exposes `/health`, `/analyze`, and `/search`.
3. **Build and load the extension:**
   ```bash
   cd extension
   npm install
   npm run build
   ```
   Then load `extension/dist` as an unpacked extension in `chrome://extensions`.
4. **Verify end-to-end:** open a news article, click the toolbar icon, confirm the instant summary (client-side) and Deep Dive analysis (requests to `http://localhost:3001`).
5. **Troubleshoot quickly:**
   - If instant summary fails, confirm the Summarizer API is available in Chrome's UI.
   - If Deep Dive errors, ensure the backend console shows incoming requests and that the Gemini API key is valid.

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

## Support

Have questions or found an issue? Reach out:
- GitHub: [github.com/AlexJanow/DeepDiveAssistant](https://github.com/AlexJanow/DeepDiveAssistant)
- Email: [alexanderjanow@gmail.com](mailto:alexanderjanow@gmail.com)

## License

MIT
