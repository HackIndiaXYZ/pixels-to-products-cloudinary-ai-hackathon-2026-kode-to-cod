# VEIL (Embargo Desk)
> **The Zero-Leak Media Distribution & Delivery-Time Privacy Protocol**  
> *Pixels to Products — Cloudinary AI Hackathon 2026 (Track 3: Media-Savvy Startup)*

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](#)
[![Cloudinary Powered](https://img.shields.io/badge/Powered%20By-Cloudinary%20AI-blue)](#)

---

## 📌 Executive Overview
Digital marketing for cinema, entertainment, and gaming requires sharing high-stakes pre-release visuals (cameos, first-look posters, key art) with third-party press, influencers, and distributors hours before launch.

Traditional tools rely on destructive, static editing: teams manually edit two separate files or risk catastrophic plot leaks.

**Veil (Embargo Desk)** flips media security from pre-upload editing to **delivery-time computation**. A single unredacted 4K/8K master asset resides in authenticated Cloudinary storage. Who is viewing, their authorized role, and the live embargo timestamp dynamically dictate the transformations applied at the edge.

---

## ⚡ Core Technical Innovations (Cloudinary Engine)

- **Targeted Spoiler Redaction (`e_blur`):** Bounding boxes isolate cameo faces or narrative spoilers. The master remains untouched while unauthorized links receive dynamic edge blurs.
- **Forensic Recipient Fingerprinting (`l_text`, `fl_tiled`):** Generates individually watermarked delivery URLs (`Confidential · Licensed to [Outlet]`) preventing anonymous leaks.
- **Atomic Synchronized Drop:** At the exact launch second, the server drops the blur transformation parameter—updating global partner embeds simultaneously without re-downloading or broken links.
- **Omnichannel & Multilingual Sprouting:** Chains localized vector title overlays (`l_<lang_logo>`) and automatic focal reframing (`g_auto`, `ar_16:9`, `ar_9:16`, `ar_1:1`).

---

## 🛠️ Architecture & Pipeline Flow

[ Studio Key Art (Master 8K) ] ──> Cloudinary Upload API (type: "authenticated")
│
┌────────────────────────────────┴────────────────────────────────┐
▼                                                                ▼
[ Pre-Embargo View (e.g. 11:59 AM) ]                           [ Global Reveal (12:00 PM) ]
Targeted Region Blur: e_blur:1000,x_,y_,w_,h_              - Atomic URL Policy Shift (Blur Dropped)
Tiled Recipient Watermark: l_text:.../fl_tiled             - Master 4K Visual Delivered Unredacted
Tamper-Proof Signature: sign_url: true                     - Multilingual Overlays & Edge Tuning

---

## 📂 Project Structure

```text
├── .env.example
├── .gitignore
├── README.md
├── next.config.js
├── package.json
├── package-lock.json
├── lib/
│   ├── cloudinary.js
│   ├── db.js
│   ├── engine.js
│   └── media.js
├── pages/
│   ├── _app.js
│   ├── index.js
│   ├── api/
│   │   ├── studio.js
│   │   ├── fan/[id].js
│   │   ├── r/[id].js
│   │   └── state/[id].js
│   ├── embed/[id].js
│   └── partners/
│       ├── cityplex.js
│       └── reelbuzz.js
├── scripts/
│   └── smoke.js
└── styles/
    └── globals.css
```

## 🚀 Quickstart & Local Setup

1. Clone the repository

```bash
git clone https://github.com/HackIndiaXYZ/pixels-to-products-cloudinary-ai-hackathon-2026-kode-to-cod.git
cd pixels-to-products-cloudinary-ai-hackathon-2026-kode-to-cod
```

2. Configure environment variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
STUDIO_KEY=change-me
```

3. Install & run

```bash
npm install
npm run dev
```

Open http://localhost:3000 to access the Studio Control Room.

---

## 🧪 Smoke Testing the Transformations

Run the built-in validation suite to verify Cloudinary endpoints and signature generation:

```bash
node scripts/smoke.js
```

---

### 5. Final Checklist

1. **Deployment:** Connect this GitHub repository to Vercel/Netlify. Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the deployment platform's environment variables settings.
2. **Video Pitch (2–4 Mins):**
   * Demonstrate the **Studio View**: upload the master asset, select the spoiler area, and set an embargo timer.
   * Show the **Partner View (`/partners/reelbuzz` or `/partners/cityplex`)**: display the blurred cameo with the tiled partner watermark.
   * Trigger the release: refresh the partner view to show the unblurred master art updating without changing the base file.
3. **Survey Submission:** Ensure all team members submit their survey details before the deadline.

---

## Security note

Before running `git commit`, verify that `.env.local` and `.data` are ignored and never staged. This protects live secrets such as `CLOUDINARY_API_SECRET` and the studio password.
