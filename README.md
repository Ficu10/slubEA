# Wesele Emilki i Adasia - lokalny serwer

Prosta strona z możliwością wrzucania zdjęć i filmów oraz przeglądania galerii.

Jak uruchomić lokalnie (Windows):

```powershell
cd e:\\slubEA
npm install
npm start
# otwórz w przeglądarce: http://localhost:3000
```

Pliki przesłane będą zapisywane w katalogu `uploads`.

Deployment to Vercel
--------------------

This repository includes a static frontend in `public/`. You can import this repo into Vercel to serve the static site directly (Vercel will serve files from `public/`). There are important caveats:
- The current server-side Express API (`server.js`) stores uploaded files on local disk and persists seating to `data/seating.json`. Vercel serverless functions do not provide persistent disk storage — uploaded files and seating data will not persist across function invocations.
- Recommended production options:
	- Deploy only the static frontend to Vercel and host the API (uploads + seating persistence) on a separate server (e.g., Render, DigitalOcean, Railway) or use cloud storage (S3) + serverless DB.
	- Or refactor the backend into Vercel Functions and integrate external storage (S3) and a database (e.g., Supabase, DynamoDB, Firebase) for persistence.

Quick steps to import into Vercel (static frontend only):

1. Push this repo to GitHub (already done).
2. In Vercel dashboard choose "Import Project" → select this GitHub repo.
3. For "Root Directory" use `/` and Vercel will pick up `vercel.json` which serves the `public` folder.

If you want, I can help convert the Express API into Vercel Serverless Functions and modify uploads to use cloud storage. For now the project uses the local Express `server.js` for uploads and seating persistence during local development. Vercel will serve the static frontend from `public/`.
