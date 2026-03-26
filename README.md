# TaskPulse

Project management dashboard

## Generated with GenMB

This project was generated using [GenMB](https://genmb.com) - AI-powered application builder.

### Original Prompt

> 

## Getting Started

### Prerequisites

- Node.js 18+

### Running Locally

1. Open `index.html` in your browser, or
2. Use a local server:
   ```bash
   npx serve .
   ```

## Framework

This project uses **Vanilla**.

## Progressive Web App (PWA)

This app is PWA-enabled and can be installed on mobile devices!

### PWA Files Included

- `manifest.json` - App manifest for installability
- `service-worker.js` - Caching and offline support
- `offline.html` - Offline fallback page
- `install-prompt.js` - "Add to Home Screen" install banner

### Installing on Mobile

1. Open the deployed app in your mobile browser
2. A custom install banner will appear after 2 seconds
3. Tap "Install" to add the app to your home screen
4. On iOS: Tap the share button and select "Add to Home Screen" (iOS shows instructions)

### Testing PWA Locally

PWA features require HTTPS to work. For local testing:

```bash
# Option 1: Use a local HTTPS server
npx local-web-server --https

# Option 2: Use Chrome's DevTools
# Open DevTools > Application > Service Workers
# Check "Bypass for network" to test offline mode
```

## License

MIT
