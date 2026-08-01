# Offline download API

These Vercel serverless functions power offline downloads.

## Required dependency

In the **project root** (next to package.json):

```bash
npm install youtubei.js
```

Without `youtubei.js`, only a few tracks resolve via Piped/LBRY mirrors. Most music videos need YouTube.js.

## Files

- `piped-streams.js` — resolves media URLs for a video id
- `media-proxy.js` — proxies the file so the browser can cache it (CORS)
- `package.json` — forces CommonJS for this folder

## Local testing

Vite does **not** run `/api/*`. Either:

1. Test downloads on the Vercel deployment, or
2. Proxy API to production in `vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': 'https://your-app.vercel.app',
  },
},
```
