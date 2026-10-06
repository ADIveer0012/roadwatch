# RoadWatch – Pothole Reporter

Citizens photograph potholes (GPS auto-captured). The admin reviews them on a dashboard/map, updates status, and exports PDF/CSV for the municipal corporation.

## Features
Camera + GPS reporting · Login · My reports · Map view · Admin dashboard · Status tracking · Severity tags ·
Duplicate detection (30 m) · Live admin alerts · Optional email alerts · Optional AI pothole check · PDF/CSV export

## Setup (about 15 minutes, all free except optional AI)
1. https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Sign-in method** → enable **Email/Password**.
3. **Build → Firestore Database** → Create database (production mode). Open **Rules**, paste `firestore.rules` (replace `admin@example.com` with YOUR email), Publish.
4. **Project settings → Your apps → Web (</>)** → copy the config into `firebase-config.js`, and set `ADMIN_EMAIL` to the same email as in the rules.
5. Run locally (camera/GPS need http://localhost or https): `npx serve .` or VS Code "Live Server".
6. Open the app, **Sign up with your admin email** – the Admin tab appears for you only.

## Deploy
- **GitHub Pages:** push to GitHub → Settings → Pages → Deploy from branch `main` / root. Then in Firebase **Authentication → Settings → Authorized domains**, add `<username>.github.io`.
- **Or Firebase Hosting:** `npm i -g firebase-tools && firebase login && firebase init hosting && firebase deploy --only hosting`.

## Optional extras
- **Email alerts:** create a free EmailJS account, a template using `{{severity}} {{description}} {{map_link}}`, and fill `EMAILJS` in `firebase-config.js`.
- **AI check:** upgrade to Blaze, `firebase functions:secrets:set ANTHROPIC_API_KEY`, `firebase deploy --only functions`, then set `AI_ENABLED = true`.

## Tech stack
| Tech | Used for |
|---|---|
| HTML/CSS/JavaScript (ES modules) | The whole front end, installable on phones from the browser |
| Browser Camera + Geolocation APIs | Capturing the photo and GPS |
| Canvas API | Compresses photos to ~800px so they fit in the database |
| Firebase Authentication | Login; separates users from the admin |
| Cloud Firestore | Stores reports, live updates to the dashboard |
| Firestore Security Rules | Only the admin can change status or delete |
| Leaflet + OpenStreetMap | Free map view |
| jsPDF | PDF export in the browser |
| Notification API + EmailJS | Admin alerts (live and email) |
| Firebase Cloud Functions (Node.js) | Optional: calls Claude for photo verification without exposing the key |
| Claude (Anthropic API) | Optional: pothole detection and severity |
| Git + GitHub Pages / Firebase Hosting | Version control and free deployment |
