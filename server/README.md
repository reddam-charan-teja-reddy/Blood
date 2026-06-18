# 🩸 Blood Network Server (Backend)

This is the backend REST API server for the Blood Network platform, built with Node.js/Express, Mongoose/MongoDB, and Twilio SMS verification.

---

## ⚙️ Environment Variables

Create a `.env` file in this directory with the following variables:

```env
# MongoDB Connection String (Atlas or Local instance)
MONGODB_URI=mongodb://localhost:27017/blood-network

# JWT Sign Secrets (Must be at least 32 characters long)
JWT_SECRET=supersecretjwtsecretkeythatisatleast32charslong
JWT_REFRESH_SECRET=supersecretjwtrefreshsecretkeythatisatleast32charslong

# API Server Port
PORT=5000

# Client App URL & CORS Allowed Origins
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# Node Environment Mode (development, production, or test)
NODE_ENV=development

# OTP Testing Bypass (Set to 'true' to allow bypassing OTP check with code '123456')
BYPASS_OTP=false

# Twilio SMS Credentials (Optional - will fall back to terminal logs if left blank)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

---

## 🛠️ Scripts

In this directory, you can run:

### `bun run dev` (or `npm run dev`)
Runs the server in development mode using hot-reload watch mode.

### `bun run start` (or `npm start`)
Starts the server in production mode.

### `bun run seed` (or `npm run seed`)
Wipes the database and seeds fresh mock data (includes mock users, organizations, and blood requests).

### `bun run test` (or `npm run test`)
Runs E2E compile-time and unit tests.

---

## 🚀 Deployment (Render)

This backend is ready for deployment as a Web Service on Render:
* **Root Directory**: `server`
* **Build Command**: `bun install` (or `npm install`)
* **Start Command**: `bun start` (or `npm start`)
* **Environment Variables**: Configure the environment variables list in the Render dashboard. Ensure `CORS_ORIGIN` points to your deployed frontend (e.g., `https://your-app.vercel.app` without a trailing slash).

---

## 🔄 Database Migrations
The server automatically executes a startup database migration ([db.js](file:///c:/Users/c9014/Downloads/New%20folder/server/src/config/db.js)) on boot to search for legacy request entries with raw ObjectId flags and upgrade them to the new `{ userId, reason, flaggedAt }` subdocument format.
