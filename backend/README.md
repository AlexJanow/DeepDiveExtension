# DeepDive Assistant Backend

Backend service for the DeepDive Assistant Chrome Extension, providing deep analysis capabilities using the Gemini API.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env`
   - Add your Gemini API key:
     ```
     GEMINI_API_KEY=your_actual_api_key_here
     ```

3. **Get a Gemini API key:**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Add it to your `.env` file

## Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on port 3000 by default (configurable via `PORT` environment variable).

## API Endpoints

### Health Check
- **GET** `/health`
- Returns server status

### Analyze Article (Coming in next task)
- **POST** `/analyze`
- Request body: `{ article: string, concepts?: string[] }`
- Returns structured analysis with related articles, definitions, and arguments

## CORS Configuration

The server is configured to accept requests from Chrome Extension origins (`chrome-extension://*`).

In production, you should restrict this to your specific extension ID by updating the `ALLOWED_ORIGINS` environment variable.

## Security & Privacy

### HTTPS Requirement

**IMPORTANT:** In production, this backend service MUST be deployed with HTTPS enabled. The Chrome Extension enforces HTTPS for all backend communication (except localhost during development).

Deployment options that provide HTTPS by default:
- **Firebase Functions** - Automatic HTTPS
- **Google Cloud Run** - Automatic HTTPS
- **Heroku** - Free HTTPS with custom domains
- **Vercel/Netlify** - Automatic HTTPS
- **AWS Lambda + API Gateway** - HTTPS enabled

### Data Handling

- Article text is sent to the Gemini API for analysis
- No user data is stored or logged permanently
- API keys are stored securely in environment variables
- CORS is configured to only accept requests from the Chrome Extension

## Environment Variables

- `GEMINI_API_KEY` - Your Gemini API key (required)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)
- `ALLOWED_ORIGINS` - CORS allowed origins (default: chrome-extension://*)
