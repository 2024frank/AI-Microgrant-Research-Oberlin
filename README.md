# AI Community Calendar Aggregator

An open-source civic tech tool that uses AI agents to aggregate events from multiple community organizations, routes them through human review, and publishes them to a unified community calendar.

Built as part of the Oberlin College AI Micro-Grant Program in partnership with the Environmental Dashboard.

## Stack

- **Frontend + API**: Next.js 15 (App Router) + TypeScript + Tailwind
- **Auth**: Firebase Authentication
- **Database**: MySQL 8 on DigitalOcean Managed Database
- **AI**: Anthropic Claude agents (one per source org)
- **Email**: Resend

## Getting Started

```bash
git clone https://github.com/2024frank/ai-microgrant.git
cd ai-microgrant
npm install
cp .env.local .env.local.local   # fill in your credentials
npm run dev
```

Then run the schema:
```bash
mysql -h your-host -u frank -p oberlin-calendar < schema.sql
```

## How It Works

1. **Admin adds a source** — just a name and a Claude agent ID. All agents share the same environment and vault from env vars.
2. **Agents run on schedule** — each agent fetches events, deduplicates against CommunityHub, outputs structured JSON.
3. **System reads the JSON** — events land in `raw_events` with `status: pending`. Each gets an `ingestedPostUrl` pointing back here.
4. **Reviewers approve or reject** — every edit and rejection is logged for research benchmarking.
5. **Approved events go to CommunityHub** — submitted via API with `ingestedPostUrl` so editors can link back.
6. **Agents learn from rejections** — rejection history is injected into each agent's system prompt before the next run.

## Environment Variables

See `.env.local` for all required variables.

## API Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/sources` | GET | Any | List all sources |
| `/api/sources` | POST | Admin | Add source (name + agent_id only) |
| `/api/sources/:id` | PATCH/DELETE | Admin | Update or deactivate |
| `/api/agent/trigger/:source_id` | POST | Admin | Manually trigger agent run |
| `/api/agent/schedule` | POST | Cron | Run all active agents |
| `/api/review/queue` | GET | Reviewer | Pending events queue |
| `/api/review/events/:id/action` | POST | Reviewer | Approve or reject |
| `/api/events/:id` | GET | Public | Deep-link endpoint (ingestedPostUrl) |
| `/api/events/:id` | PATCH | Reviewer | Edit + re-submit to CommunityHub |
| `/api/admin/stats` | GET | Admin | All analytics data |

## Open Source

No hardcoded org names anywhere — all source names, agent IDs, and config come from the database. Deploy for any community.
