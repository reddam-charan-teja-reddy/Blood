# 🩸 Blood Network Client (Frontend)

This is the frontend client-side application for the Blood Network platform, built with React, Vite, TanStack Query, and styled with custom Vanilla CSS.

---

## ⚙️ Environment Variables

Create a `.env` file in this directory with the following variables:

```env
# URL pointing to the backend API.
# CRITICAL: Always include the /api/v1 prefix (e.g. http://localhost:5000/api/v1)
VITE_API_URL=http://localhost:5000/api/v1
```

*Note: In production (e.g., Vercel), configure this variable in the dashboard environment settings.*

---

## 🛠️ Scripts

In this directory, you can run:

### `bun run dev` (or `npm run dev`)
Runs the app in development mode. Open [http://localhost:5173](http://localhost:5173) to view it in your browser.

### `bun run build` (or `npm run build`)
Builds the app for production to the `dist` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

### `bun run preview` (or `npm run preview`)
Locally previews the production build compiled by the `build` command.

---

## 🚀 Deployment (Vercel)

This frontend is configured for instant deployment to Vercel:
* **Root Directory**: `client`
* **Framework Preset**: `Vite`
* **Build Command**: `npm run build` (or `bun run build`)
* **Output Directory**: `dist`
* **Environment Variables**: Add `VITE_API_URL` pointing to your deployed API server (including `/api/v1`).
* **SPA Routing**: The project includes [vercel.json](file:///c:/Users/c9014/Downloads/New%20folder/client/vercel.json) to rewrite all requests to `index.html` to support client-side React routing.
