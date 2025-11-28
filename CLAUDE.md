# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Saarathi is a WhatsApp-native business intelligence assistant for Indian micro-businesses. It answers the question every micro-business owner has: "How is my business doing, and what will next week look like?"

**Target**: MumbaiHacks 2025 - Fintech Track (PS2)

## Development Commands

```bash
# Development
pnpm dev          # Start Next.js dev server

# Build & Production
pnpm build        # Build for production
pnpm start        # Start production server

# Linting
pnpm lint         # Run ESLint

# Database (Prisma)
npx prisma generate    # Generate Prisma client (outputs to src/generated/prisma)
npx prisma db push     # Push schema changes to database
npx prisma migrate dev # Create and apply migrations
npx prisma studio      # Open database GUI
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **AI**: Vercel AI SDK with AI Gateway
- **Background Jobs**: Trigger.dev
- **Package Manager**: pnpm

## Architecture

```
src/
├── app/              # Next.js App Router pages and API routes
│   └── api/          # WhatsApp webhook, cron endpoints
├── generated/prisma/ # Auto-generated Prisma client (do not edit)
├── services/         # Core business logic
│   ├── message-router/    # Parse WhatsApp messages, route to handlers
│   ├── transaction/       # Log transactions from text/photo/voice
│   ├── projection/        # Calculate future cash positions
│   ├── health/            # Compute business health score (0-100)
│   ├── alert/             # Identify and create alerts
│   └── brief/             # Generate morning/evening messages
├── lib/              # Shared utilities (prisma client, AI client)
└── trigger/          # Trigger.dev scheduled jobs
prisma/
├── schema.prisma     # Database schema
└── migrations/       # Database migrations
```

## Domain Model

Core entities to implement in Prisma schema:

- **Owner**: Business owner profile (phone, name, business_name, current_cash, settings)
- **Staff**: Employees (name, salary_amount, salary_type, payment_day, advance_balance)
- **Customer**: Customers with payment tracking (name, phone, reliability_score)
- **Transaction**: Income/expense records (type, category, amount, source)
- **Receivable**: Pending payments (customer_id, amount, status, age_days)
- **Projection**: Daily cash forecasts (date, projected_cash, confidence)
- **Alert**: Proactive warnings (type, severity, message, status)

## Key Features

1. **Cash Flow Projections** (Hero Feature): 7/14/30-day forecasts with problem days highlighted
2. **Health Score**: Single 0-100 score combining cash runway, profit margin, collection speed, expense control, growth trend
3. **Transaction Logging**: Text, photo (OCR), voice input via WhatsApp
4. **Payroll Management**: Staff salaries, advances, payment reminders
5. **Proactive Alerts**: Cash crunch warnings, salary gap alerts, expense spikes

## Scheduled Jobs (Trigger.dev)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `morning-brief` | 9:00 AM | Daily business snapshot |
| `evening-wrap` | 8:00 PM | Day's summary |
| `projection-refresh` | Every 6 hours | Recalculate projections |
| `alert-check` | Every 3 hours | Check warning conditions |
| `salary-reminder` | 9:00 AM (when due) | Upcoming salary reminders |
| `weekly-summary` | Sunday 10 AM | Weekly health report |

## Health Score Formula

| Component | Weight | Measures |
|-----------|--------|----------|
| Cash Runway | 25% | Days of expenses covered by current cash |
| Profit Margin | 25% | Revenue minus expenses, as percentage |
| Collection Speed | 15% | How fast money comes in |
| Expense Control | 15% | Expenses vs historical average |
| Growth Trend | 20% | Revenue trend vs previous period |

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `TRIGGER_API_KEY` - Trigger.dev API key
- `WHATSAPP_TOKEN` - WhatsApp Business API token
- `AI_GATEWAY_API_KEY` - Vercel AI Gateway key
