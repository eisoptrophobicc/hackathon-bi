DataIntel
DataIntel is an AI-powered YouTube analytics dashboard generator built as a hackathon project. Users ask natural language questions about their data and receive interactive dashboards with KPIs, charts, and insights in seconds.
​

Features
Natural language queries convert to SQL and visualizations automatically.
​

Supports bar, donut, area charts with anomaly detection and AI commentary.
​

Voice input via Web Speech API, exports to PDF/PNG/CSV/JSON, sharing links.
​

Alerts for metrics like "views drop below 10k", scheduled PDF reports.
​

CSV upload for local data, pre-loaded YouTube schema with 12 columns.
​

Tech Stack
Technology	Role
React 18	UI framework
Claude Sonnet	AI/NLP to SQL
Recharts	Data visualization
Next.js	React framework
Tailwind CSS	Styling
Vercel	Deployment
localStorage	Client persistence
Quick Start
Clone from GitHub: https://github.com/eisoptrophobicc/hackathon-bi
​

Run locally: Single React file, no build needed – open index.html in browser.
​

Upload CSV or connect PostgreSQL backend for schema (via /schema endpoint).
​

Ask: "Show views by category" for instant dashboard.
​

Demo datasets cover category performance, regional engagement, monetization impact.
​

Development
Theme: Sahara Dusk (light/dark toggle).
​

Backend: Claude API for NL-to-SQL, optional for emails/schedules.
​

Shortcuts: Ctrl+S save, Ctrl+E export, Ctrl+K command palette.
​

MIT license, live demo on Devpost.