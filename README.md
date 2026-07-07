# ClientRadar AI - Autonomous B2B Prospecting Agent

An interactive, high-fidelity single-page dashboard showcasing a simulated **Autonomous Client Search Agent**. The tool provides B2B lead generation lists partitioned between **Indian Clients** and **Foreign Clients**, along with integrated automated cold-pitch generators and data exports.

## Core Features

- **Agent Configuration Panel**: Set your target client niche/industry (e.g., *SaaS*, *EdTech*, *Web Design*), select custom search depth limits, and define target lead filters.
- **Interactive Scraper Console**: A terminal window simulation displaying step-by-step logs of the agent's background activities (WHOIS checks, SERP scraping, MX record handshakes, and geo-ip lookup routing).
- **Segmented Lists Tabs**: Split view grids for **Indian Clients** (displaying national hubs like Bangalore, Mumbai, NCR) and **Foreign Clients** (covering global markets like SF, London, Singapore, Toronto).
- **Pitch Outreach Modals**: Select any prospective company card to open an outreach panel featuring a cold-email copywriter equipped with tone adjusters (Casual, Formal, and Value-Driven).
- **State Cache Persistence**: Search records are saved automatically to `localStorage` and restored when reloading the tab.
- **CSV Data Exporter**: Instant download of the client database formatted for Google Sheets or Excel.

## Quick Launch Instructions

### 1. Launch Direct in Browser
You can open the dashboard by double-clicking the `index.html` file directly in your file manager, or drag-and-dropping it into any modern web browser (Chrome, Edge, Firefox, Safari).

### 2. Launch using Local Development Server
To run with clean routing and local assets, execute a local web server within this directory:

**Using Node.js:**
```bash
# Using npx (no install required)
npx serve .
```

**Using Python:**
```bash
# Starts server at http://localhost:8000
python -m http.server 8000
```

---
*Developed with premium glassmorphism styling, outfit typography, and custom micro-animations.*
