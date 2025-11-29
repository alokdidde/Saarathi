# Saarathi

**WhatsApp-native Business Intelligence for Indian Micro-Businesses**

Saarathi answers the question every micro-business owner has: *"How is my business doing, and what will next week look like?"*

Built for **MumbaiHacks 2025 - Fintech Track (PS2)**

## Features

### Core Capabilities

- **Cash Flow Projections** - 7/14/30-day forecasts with problem days highlighted
- **Business Health Score** - Single 0-100 score combining:
  - Cash runway (25%)
  - Profit margin (25%)
  - Collection speed (15%)
  - Expense control (15%)
  - Growth trend (20%)
- **Transaction Logging** - Text, photo (OCR with image optimization), and voice input via WhatsApp
- **Payroll Management** - Staff salaries, advances, payment reminders
- **Proactive Alerts** - Cash crunch warnings, salary gap alerts, expense spikes, overdue payments

### AI Agent Tools

The Saarathi agent includes tools for:
- `logExpense` - Log business expenses
- `recordIncome` - Record payments received
- `addStaff` / `paySalary` / `giveAdvance` - Staff management
- `addCustomer` / `createReceivable` - Customer and credit tracking
- `getBusinessStatus` / `getStaffList` / `getPendingPayments` - Business queries
- `getCashForecast` - Cash flow projections
- `getAlerts` / `dismissAlert` - Alert management

### Scheduled Jobs (Trigger.dev)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `morning-brief` | 9:00 AM IST | Daily business snapshot |
| `evening-wrap` | 8:00 PM IST | Day's summary |
| `salary-reminder` | 9:00 AM IST | Check for upcoming salaries |
| `projection-refresh` | Every 6 hours | Recalculate 30-day projections |

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **AI**: Vercel AI SDK v5 with AI Gateway (GPT-4o)
- **Image Processing**: Sharp (resize/compress for OCR)
- **Background Jobs**: Trigger.dev v4
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- pnpm (`npm install -g pnpm`)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd saarathi

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Push database schema
npx prisma db push

# Seed demo data (optional)
pnpm db:seed

# Start development server
pnpm dev
```

### Environment Variables

Create a `.env` file with:

```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/saarathi"

# AI Gateway
AI_GATEWAY_API_KEY="your-vercel-ai-gateway-key"

# Trigger.dev (for scheduled jobs)
TRIGGER_API_KEY="your-trigger-api-key"

# WhatsApp (for production)
WHATSAPP_TOKEN="your-whatsapp-business-api-token"
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/           # Main chat endpoint (AI agent)
│   │   ├── briefs/         # Generate business briefs
│   │   ├── messages/       # Simulator message sync
│   │   ├── customer-messages/  # Customer chat for demos
│   │   ├── seed/           # Demo data seeding
│   │   └── state/          # Business state inspector
│   └── simulator/          # Demo UI for hackathon
│       ├── page.tsx        # Main simulator (3-panel)
│       ├── chat/           # Standalone chat view
│       ├── control/        # Multi-device control panel
│       └── customer/       # Customer perspective view
├── lib/
│   ├── agent.ts           # AI agent with business tools
│   └── db.ts              # Prisma client
├── services/
│   └── brief/             # Brief generation logic
├── trigger/
│   └── scheduled-jobs.ts  # Trigger.dev cron jobs
└── generated/prisma/      # Auto-generated Prisma client
```

## Database Schema

### Core Models

| Model | Purpose |
|-------|---------|
| `Owner` | Business owner profile (phone, cash, onboarding status) |
| `Staff` | Employees with salary info and advance balances |
| `Customer` | Customers with reliability scores |
| `Transaction` | All income/expense records |
| `Receivable` | Pending payments from customers |
| `Projection` | Daily cash flow forecasts |
| `Alert` | Proactive business warnings |

### Simulator Models

| Model | Purpose |
|-------|---------|
| `SimulatorMessage` | Multi-device chat sync for demos |
| `CustomerMessage` | Customer perspective messages |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Process message through AI agent |
| `/api/briefs` | POST | Generate morning/evening/weekly briefs |
| `/api/messages` | GET/DELETE | Fetch/clear simulator messages |
| `/api/customer-messages` | GET/POST | Customer chat messages |
| `/api/state` | GET | Get current business state |
| `/api/seed` | POST/DELETE | Seed/reset demo data |

## Simulator

The simulator provides a demo environment for the hackathon:

- **Main View** (`/simulator`) - 3-panel layout with chat, scenarios, and state inspector
- **Chat View** (`/simulator/chat?phone=XXX`) - Standalone phone mockup
- **Control Panel** (`/simulator/control?phone=XXX`) - Multi-device sync demo
- **Customer View** (`/simulator/customer?id=XXX`) - Collection reminder perspective

### Demo Flow

1. Open `/simulator` to access the main interface
2. Use scenario buttons to trigger sample interactions
3. View real-time state updates in the inspector panel
4. Generate briefs (morning/evening/weekly/health/P&L)

## Development Commands

```bash
# Development
pnpm dev              # Start Next.js dev server

# Build & Production
pnpm build            # Build for production
pnpm start            # Start production server

# Linting
pnpm lint             # Run ESLint

# Database
npx prisma generate   # Generate Prisma client
npx prisma db push    # Push schema to database
npx prisma studio     # Open database GUI
pnpm db:seed          # Seed demo data
pnpm db:reset         # Reset and reseed database
```

## License

MIT
