# Firebase Functions Deployment

This directory contains the Firebase Functions deployment configuration for the DeepDive Assistant backend.

## Prerequisites

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Create a Firebase project at https://console.firebase.google.com/

## Setup

1. Update `.firebaserc` with your Firebase project ID:
```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

2. Set the Gemini API key:
```bash
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
```

3. (Optional) Set the allowed Chrome Extension ID for production:
```bash
firebase functions:config:set extension.id="YOUR_EXTENSION_ID"
```

4. Install dependencies:
```bash
npm install
```

## Local Testing

Run the Firebase emulator:
```bash
npm run serve
```

The function will be available at: `http://localhost:5001/YOUR_PROJECT_ID/us-central1/api`

## Deployment

### Deploy to staging:
```bash
firebase use staging  # If you have a staging project
npm run deploy
```

### Deploy to production:
```bash
firebase use production
npm run deploy
```

## Function URL

After deployment, your function will be available at:
```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```

Update your Chrome Extension's backend URL to point to this endpoint.

## Monitoring

View logs:
```bash
npm run logs
```

Or view in Firebase Console:
https://console.firebase.google.com/project/YOUR_PROJECT_ID/functions/logs

## Rate Limiting

The function includes built-in rate limiting:
- 10 requests per minute per origin
- Uses Firestore for distributed rate limiting
- Returns 429 status code when limit exceeded

## Security Features

- CORS restricted to chrome-extension:// origins
- Specific extension ID validation in production (when configured)
- Request size limit: 1MB
- Article length limit: 500,000 characters
- Input validation for all parameters

## Cost Optimization

Firebase Functions pricing:
- First 2 million invocations/month: Free
- Additional invocations: $0.40 per million
- Compute time: $0.0000025 per GB-second

Estimated cost for 10,000 requests/month: ~$0.50-$2.00

## Troubleshooting

### Function not deploying:
```bash
firebase deploy --only functions --debug
```

### View configuration:
```bash
firebase functions:config:get
```

### Clear configuration:
```bash
firebase functions:config:unset gemini.api_key
```
