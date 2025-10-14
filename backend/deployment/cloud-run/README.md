# Cloud Run Deployment

This directory contains the Cloud Run deployment configuration for the DeepDive Assistant backend.

## Prerequisites

1. Install Google Cloud SDK:
```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash

# Windows
# Download from https://cloud.google.com/sdk/docs/install
```

2. Login to Google Cloud:
```bash
gcloud auth login
```

3. Set your project:
```bash
gcloud config set project YOUR_PROJECT_ID
```

4. Enable required APIs:
```bash
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

## Setup

1. Copy your backend files to this directory:
```bash
cp ../../server.js .
cp ../../package.json .
cp ../../package-lock.json .
```

2. Build the Docker image locally (optional, for testing):
```bash
docker build -t deepdive-assistant-backend .
docker run -p 8080:8080 -e GEMINI_API_KEY="your_key" deepdive-assistant-backend
```

## Deployment

### Option 1: Manual Deployment

1. Build and push the container:
```bash
# Set your project ID
export PROJECT_ID=your-project-id

# Build the image
gcloud builds submit --tag gcr.io/$PROJECT_ID/deepdive-assistant-backend

# Deploy to Cloud Run
gcloud run deploy deepdive-assistant-backend \
  --image gcr.io/$PROJECT_ID/deepdive-assistant-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

2. Set the Gemini API key as a secret:
```bash
# Create secret
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-

# Grant Cloud Run access to the secret
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### Option 2: Automated Deployment with Cloud Build

1. Set up Cloud Build trigger:
```bash
gcloud builds submit --config cloudbuild.yaml
```

2. For continuous deployment, connect your Git repository:
```bash
# This will create a trigger that deploys on every push to main
gcloud builds triggers create github \
  --repo-name=your-repo \
  --repo-owner=your-username \
  --branch-pattern="^main$" \
  --build-config=deployment/cloud-run/cloudbuild.yaml
```

## Configuration

### Environment Variables

Set environment variables:
```bash
gcloud run services update deepdive-assistant-backend \
  --set-env-vars NODE_ENV=production,ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

### Secrets

Use Google Secret Manager for sensitive data:
```bash
gcloud run services update deepdive-assistant-backend \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

### CORS Configuration

For production, restrict CORS to your specific extension ID:
```bash
gcloud run services update deepdive-assistant-backend \
  --set-env-vars ALLOWED_EXTENSION_ID=YOUR_EXTENSION_ID
```

## Service URL

After deployment, get your service URL:
```bash
gcloud run services describe deepdive-assistant-backend \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'
```

Update your Chrome Extension's backend URL to point to this endpoint.

## Monitoring

### View logs:
```bash
gcloud run services logs read deepdive-assistant-backend \
  --platform managed \
  --region us-central1
```

### View in Cloud Console:
https://console.cloud.google.com/run

## Scaling Configuration

Configure autoscaling:
```bash
gcloud run services update deepdive-assistant-backend \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --cpu 1 \
  --memory 512Mi
```

## Rate Limiting

Cloud Run doesn't include built-in rate limiting. Options:

1. **Cloud Armor** (recommended for production):
```bash
# Create rate limit policy
gcloud compute security-policies create rate-limit-policy \
  --description "Rate limit for DeepDive Assistant"

# Add rate limit rule
gcloud compute security-policies rules create 1000 \
  --security-policy rate-limit-policy \
  --expression "true" \
  --action "rate-based-ban" \
  --rate-limit-threshold-count 100 \
  --rate-limit-threshold-interval-sec 60 \
  --ban-duration-sec 600
```

2. **Application-level** (included in server.js):
   - Use Redis or Memorystore for distributed rate limiting
   - Current implementation uses in-memory rate limiting (single instance only)

## Cost Optimization

Cloud Run pricing:
- First 2 million requests/month: Free
- Additional requests: $0.40 per million
- CPU: $0.00002400 per vCPU-second
- Memory: $0.00000250 per GiB-second

Estimated cost for 10,000 requests/month: ~$1-$5

Tips:
- Set `--min-instances 0` to scale to zero when idle
- Use `--cpu 1` and `--memory 512Mi` for cost efficiency
- Enable request timeout: `--timeout 60s`

## Troubleshooting

### View deployment status:
```bash
gcloud run services describe deepdive-assistant-backend \
  --platform managed \
  --region us-central1
```

### Test the service:
```bash
SERVICE_URL=$(gcloud run services describe deepdive-assistant-backend \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)')

curl $SERVICE_URL/health
```

### Debug container locally:
```bash
docker run -it --entrypoint /bin/bash deepdive-assistant-backend
```

## Security Best Practices

1. **Use secrets for API keys** (not environment variables)
2. **Restrict CORS** to specific extension ID in production
3. **Enable Cloud Armor** for DDoS protection
4. **Set up Cloud Monitoring** alerts
5. **Use VPC Service Controls** for additional security
6. **Enable audit logging**

## Staging Environment

Deploy to staging:
```bash
gcloud run deploy deepdive-assistant-backend-staging \
  --image gcr.io/$PROJECT_ID/deepdive-assistant-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=staging
```
