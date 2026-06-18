# 🩸 Blood Network App

A modern, geolocation-based web application connecting blood donors (individuals), blood banks/hospitals (organizations), and administrators to facilitate real-time, emergency blood request coordination.

---

## 📂 Repository Structure

The project is structured as a monorepo containing two main components:

* **[`/client`](file:///c:/Users/c9014/Downloads/New%20folder/client)**: React frontend built with Vite, TanStack Query, and styled with premium Vanilla CSS.
* **[`/server`](file:///c:/Users/c9014/Downloads/New%20folder/server)**: Express API backend server powered by MongoDB/Mongoose.

---

## ⚙️ Local Setup Guide

### 1. Prerequisites
Ensure you have the following installed locally:
* **Node.js** (v18+) or **Bun** (v1.0+)
* **MongoDB** (Running locally or an Atlas connection URI)

### 2. Backend Setup
1. Open your terminal in the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   bun install   # or: npm install
   ```
3. Create a `.env` file from the example template:
   ```bash
   cp .env.example .env
   ```
4. Update the values in `.env`:
   * **`MONGODB_URI`**: Set to your local MongoDB server or MongoDB Atlas connection string.
   * **`JWT_SECRET` & `JWT_REFRESH_SECRET`**: Set to secure random strings.
   * **`CORS_ORIGIN`**: Set to `http://localhost:5173` (Vite's default port).
   * **`BYPASS_OTP`**: Set to `true` to enable testing bypass using the OTP code `123456`.
5. Seed test data:
   ```bash
   bun run seed   # or: npm run seed
   ```
6. Start the server in watch mode:
   ```bash
   bun run dev    # or: npm run dev
   ```
   *The server runs on [http://localhost:5000](http://localhost:5000)*

---

### 3. Frontend Setup
1. Open a new terminal in the `client` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   bun install   # or: npm install
   ```
3. Create a `.env` file from the example template:
   ```bash
   cp .env.example .env
   ```
4. Ensure the API endpoint points to your backend URL:
   ```env
   VITE_API_URL=http://localhost:5000/api/v1
   ```
5. Start the frontend server:
   ```bash
   bun run dev    # or: npm run dev
   ```
   *The client will open in your browser at [http://localhost:5173](http://localhost:5173)*

---

## 🔑 OTP Testing Bypass

To make testing easier without using Twilio credentials, a secure bypass mode is available:
* In your `server/.env` file, set:
  ```env
  BYPASS_OTP=true
  ```
* In the login, signup, or contact reveal screens, you can input **`123456`** as the OTP code, which will be accepted as valid.
* When this is disabled or set to `false`, the server will fall back to using your configured Twilio account or logging generated mock OTPs in the server terminal logs.

---

## 🧪 Running Tests

A suite of E2E, scoping, and integration tests is available in the `server` folder:

* **Compile-time and Unit tests**:
  ```bash
  bun run test                 # or: npm run test
  ```
* **Regional moderation scoping tests**:
  ```bash
  node test_admin_scopes.js
  ```
* **Moderation scope guardrails integration tests**:
  ```bash
  node test_admin_scope_guardrails.js
  ```

---

## 🚀 Deployment Strategy

For full guides on deploying the application to production, please check the dedicated strategy file:
* **[deployment_strategy.md](file:///C:/Users/c9014/.gemini/antigravity-ide/brain/2ce741e1-1672-4fb6-8aea-c2169fbbc70a/deployment_strategy.md)**: A complete walkthrough on setting up MongoDB Atlas, deploying the Express API to **Render**, and deploying the Vite client to **Vercel** (with `vercel.json` routing support).
