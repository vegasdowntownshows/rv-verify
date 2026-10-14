# 🛡️ RV VERIFY — High-Security Discord Anti-Alt & Integrity Gate

> **The Ultimate Double Counter & Vaultcord Alternative for Gambling Communities, High-Stakes Discord Servers, and Bot-Farm Prevention.**

---

## ⚡ Overview

**RV VERIFY** is a custom, self-hosted Discord verification bot and web portal designed specifically to eliminate alting, bonus farming, ban evasion, and bot raiding.

Double Counter and other public verification bots have suffered data breaches, bypasses via simple incognito tabs or VPNs, and downtime. **RV VERIFY** combines a modern dark-themed web portal with **client-side hardware fingerprinting, multi-storage token tracking (Evercookie-lite), VPN/Proxy inspection, and automated alt-cluster linking**.

When an alt attempt is detected, the bot **instantly halts verification** and **alerts server administrators** in a private channel with a complete dossier:
- Suspect's Discord tag and ID
- Exact matching vectors (e.g. Canvas hash, GPU unmasked renderer, Persistent Device Token, IP)
- Confidence percentage (e.g. 98–100%)
- **List of ALL other Discord accounts owned by that user**
- One-click Admin Buttons (`Ban Suspect & Alts`, `Kick Suspect`, `Whitelist User`)

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **Triple-Vector Hardware Fingerprinting** | Computes unique hashes for Canvas 2D rasterization, WebGL 3D GPU renderer, and WebAudio DSP oscillator dynamics. |
| **Persistent Multi-Storage Token (Evercookie)** | Syncs an encrypted hardware token across `IndexedDB`, `localStorage`, `sessionStorage`, and secure cookies. Alts trying to verify on the same browser profile are caught with **100% confidence**. |
| **Complete Alt Dossier & Graph Traversal** | When an alt is detected, RV VERIFY queries the database graph and displays **every single linked Discord account** owned by the alter in the admin alert. |
| **VPN & Datacenter Proxy Blocker** | Detects cloud hosting providers (AWS, OVH, DigitalOcean, Linode) and VPN exit nodes via IP heuristics and ProxyCheck.io integration. |
| **Headless Bot Farm Detection** | Flags automated Selenium, Puppeteer, and Playwright browsers (`navigator.webdriver`, Chrome DevTools Protocol artifacts, missing plugin arrays). |
| **Account Age Safeguard** | Blocks throwaway raid accounts created less than X days ago (customizable, default 3 days). |
| **One-Click Staff Actions** | Direct interactive buttons on the admin alert embed to **Ban All Alts** with a single click. |
| **Zero Third-Party Data Leak Risk** | 100% self-hosted on your own machine or VPS using high-speed SQLite WAL mode. No external services store your users' data. |

---

## 🛠️ Tech Stack

- **Discord Bot**: Node.js v18+ / v20+ / v24+ with `discord.js` v14
- **Web Portal**: Express.js with custom HTML5/CSS3 dark-mode casino theme
- **Database**: `better-sqlite3` with Write-Ahead Logging (WAL)
- **Security**: SubtleCrypto SHA-256, OfflineAudioContext, WebGL debug renderer info, WebRTC leak inspection

---

## 📋 Slash Commands

| Command | Permissions | Description |
| :--- | :--- | :--- |
| `/setup` | Administrator | Configure the Verified Role, Unverified Role, and Alt Logs Channel. |
| `/sendverify` | Administrator | Post the official RV VERIFY verification prompt and button in `#verify`. |
| `/lookup <user>` | Moderate Members | View a member's complete dossier: all linked alts, last known IP, GPU, and verification history. |
| `/alts [limit]` | Moderate Members | View the latest alt account detection events and flagged rings. |
| `/whitelist <user>` | Administrator | Whitelist a member to bypass alt/VPN checks (e.g., shared family PC). |
| `/blacklist <user>` | Ban Members | Permanently block a malicious user or alt ring from verifying. |
| `/stats` | Everyone | View server stats: total verified, alts blocked, and VPNs rejected. |

---

## ⚙️ Quick Start Installation

### 1. Prerequisites
- **Node.js** v18 or higher (`node -v`)
- A **Discord Application & Bot** from the [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Configure Discord Developer Portal
1. Go to [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application** (Name it `RV VERIFY`).
2. Under **Bot**:
   - Enable **Server Members Intent** (Privileged Gateway Intents).
   - Click **Reset Token** and copy your Bot Token.
3. Under **OAuth2**:
   - Copy your **Client ID** and **Client Secret**.
   - Under **Redirects**, add: `http://localhost:3000/auth/callback` (or your domain: `https://verify.yourdomain.com/auth/callback`).
4. Under **OAuth2 -> URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Roles`, `Send Messages`, `Embed Links`, `Ban Members`, `Kick Members`, `View Audit Log`
   - Use the generated URL to invite RV VERIFY to your server.

### 3. Setup Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your values:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here

PORT=3000
BASE_URL=http://localhost:3000

MIN_ACCOUNT_AGE_DAYS=3
BLOCK_VPN=true
STRICT_ALT_BLOCK=true
```

### 4. Start RV VERIFY
```bash
npm start
```
Or for production background hosting with PM2:
```bash
npm install -g pm2
pm2 start src/index.js --name "rv-verify"
```

---

## 🛡️ In-Server Setup (2 Minutes)

1. Ensure the **RV VERIFY** role in Discord Server Settings -> Roles is dragged **ABOVE** the Verified Role so it has permission to assign it.
2. In your Discord server, type:
   ```
   /setup verified_role:@Member log_channel:#alt-logs unverified_role:@Unverified
   ```
3. In your `#verify` channel, type:
   ```
   /sendverify
   ```
4. Done! Any member who clicks **Verify with RV VERIFY** will be gated, fingerprinted, and screened for alts.

---

## 🔒 Security Best Practices for Gambling Servers

1. **Role Hierarchy**: Place RV VERIFY's bot role near the top of your server roles list.
2. **Channel Permissions**: Set your `#verify` channel permissions so `@everyone` can view and click buttons, but cannot speak. All other channels should require the `@Verified` role to view.
3. **Domain Hosting**: When deploying live, point a domain (e.g. `verify.yourdomain.com`) with Cloudflare SSL to port 3000. Set `BASE_URL=https://verify.yourdomain.com` in your `.env`.
