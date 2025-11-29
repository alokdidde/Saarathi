import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { db } from "./db";

// Health Score Components (from PRD)
// - Cash Runway (25%) - days of expenses covered
// - Profit Margin (25%) - revenue minus expenses %
// - Collection Speed (15%) - avg days to collect
// - Expense Control (15%) - expenses vs average
// - Growth Trend (20%) - revenue vs previous period

interface HealthScoreResult {
  score: number;
  status: "excellent" | "good" | "caution" | "critical";
  components: {
    cashRunway: { score: number; days: number };
    profitMargin: { score: number; percentage: number };
    collectionSpeed: { score: number; avgDays: number };
    expenseControl: { score: number; vsAverage: number };
    growthTrend: { score: number; percentage: number };
  };
}

export async function calculateHealthScore(ownerId: string): Promise<HealthScoreResult> {
  const owner = await db.owner.findUnique({ where: { id: ownerId } });
  const currentCash = owner?.currentCash || 0;

  // Get transactions for calculations
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const thisMonthTxns = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: startOfMonth } },
  });

  const lastMonthTxns = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
  });

  // Calculate metrics
  const thisMonthIncome = thisMonthTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const thisMonthExpenses = thisMonthTxns.filter(t => t.type !== "income").reduce((s, t) => s + t.amount, 0);
  const lastMonthIncome = lastMonthTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const lastMonthExpenses = lastMonthTxns.filter(t => t.type !== "income").reduce((s, t) => s + t.amount, 0);

  // Get receivables for collection speed
  const receivables = await db.receivable.findMany({
    where: { ownerId, status: "paid" },
  });
  const avgCollectionDays = receivables.length > 0
    ? receivables.reduce((sum, r) => {
        const days = r.paidAt ? Math.floor((r.paidAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 30;
        return sum + days;
      }, 0) / receivables.length
    : 15;

  // 1. Cash Runway (25%) - days of expenses covered
  const dailyExpenses = thisMonthExpenses / Math.max(now.getDate(), 1);
  const runwayDays = dailyExpenses > 0 ? Math.floor(currentCash / dailyExpenses) : 30;
  const cashRunwayScore = Math.min(100, Math.max(0, runwayDays * 3.33)); // 30 days = 100

  // 2. Profit Margin (25%)
  const profitMargin = thisMonthIncome > 0 ? ((thisMonthIncome - thisMonthExpenses) / thisMonthIncome) * 100 : 0;
  const profitMarginScore = Math.min(100, Math.max(0, profitMargin * 2.5)); // 40% margin = 100

  // 3. Collection Speed (15%)
  const collectionScore = Math.min(100, Math.max(0, 100 - (avgCollectionDays * 3.33))); // 0 days = 100, 30 days = 0

  // 4. Expense Control (15%)
  const expenseRatio = lastMonthExpenses > 0 ? thisMonthExpenses / lastMonthExpenses : 1;
  const expenseControlScore = Math.min(100, Math.max(0, 100 - ((expenseRatio - 1) * 100))); // Same = 100, 2x = 0

  // 5. Growth Trend (20%)
  const growthRate = lastMonthIncome > 0 ? ((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0;
  const growthScore = Math.min(100, Math.max(0, 50 + growthRate * 2)); // 0% = 50, 25% = 100

  // Calculate weighted score
  const weightedScore = Math.round(
    cashRunwayScore * 0.25 +
    profitMarginScore * 0.25 +
    collectionScore * 0.15 +
    expenseControlScore * 0.15 +
    growthScore * 0.20
  );

  const status: HealthScoreResult["status"] =
    weightedScore >= 80 ? "excellent" :
    weightedScore >= 60 ? "good" :
    weightedScore >= 40 ? "caution" : "critical";

  return {
    score: weightedScore,
    status,
    components: {
      cashRunway: { score: Math.round(cashRunwayScore), days: runwayDays },
      profitMargin: { score: Math.round(profitMarginScore), percentage: Math.round(profitMargin) },
      collectionSpeed: { score: Math.round(collectionScore), avgDays: Math.round(avgCollectionDays) },
      expenseControl: { score: Math.round(expenseControlScore), vsAverage: Math.round((expenseRatio - 1) * 100) },
      growthTrend: { score: Math.round(growthScore), percentage: Math.round(growthRate) },
    },
  };
}

// Get business data for briefs
async function getBusinessData(ownerId: string) {
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    include: { staff: { where: { isActive: true } } },
  });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayTxns = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: startOfToday } },
  });

  const monthTxns = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: startOfMonth } },
  });

  const receivables = await db.receivable.findMany({
    where: { ownerId, status: { in: ["pending", "partial"] } },
    include: { customer: true },
  });

  const healthScore = await calculateHealthScore(ownerId);

  // Calculate 3-day projection
  const staff = owner?.staff || [];
  const monthlyPayroll = staff.reduce((sum, s) => sum + s.salaryAmount, 0);
  const dailyBurn = monthlyPayroll / 30;
  let projectedCash = owner?.currentCash || 0;
  const next3Days = [];

  for (let i = 1; i <= 3; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    projectedCash -= dailyBurn;
    const isSalaryDay = date.getDate() === 1;
    if (isSalaryDay) projectedCash -= monthlyPayroll;

    next3Days.push({
      day: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
      amount: Math.round(projectedCash),
      flag: projectedCash < 0 ? "negative" : isSalaryDay ? "salary" : projectedCash < monthlyPayroll * 0.5 ? "low" : "ok",
    });
  }

  return {
    owner,
    currentCash: owner?.currentCash || 0,
    todayIncome: todayTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    todayExpenses: todayTxns.filter(t => t.type !== "income").reduce((s, t) => s + t.amount, 0),
    monthIncome: monthTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    monthExpenses: monthTxns.filter(t => t.type !== "income").reduce((s, t) => s + t.amount, 0),
    pendingTotal: receivables.reduce((s, r) => s + (r.amount - (r.amountPaid || 0)), 0),
    receivables,
    staff,
    monthlyPayroll,
    healthScore,
    next3Days,
  };
}

export async function generateMorningBrief(ownerId: string): Promise<string> {
  const data = await getBusinessData(ownerId);

  const prompt = `Generate a morning business brief in Hinglish (Hindi + English mix) for a WhatsApp message.

BUSINESS DATA:
- Owner: ${data.owner?.name}
- Business: ${data.owner?.businessName}
- Cash in hand: ₹${data.currentCash.toLocaleString("en-IN")}
- Pending collections: ₹${data.pendingTotal.toLocaleString("en-IN")}
- Health Score: ${data.healthScore.score}/100 (${data.healthScore.status})
- This month income: ₹${data.monthIncome.toLocaleString("en-IN")}
- This month expenses: ₹${data.monthExpenses.toLocaleString("en-IN")}
- Staff payroll: ₹${data.monthlyPayroll.toLocaleString("en-IN")}/month
- Next 3 days projection: ${data.next3Days.map(d => `${d.day}: ₹${d.amount} (${d.flag})`).join(", ")}
- Top pending: ${data.receivables.slice(0, 3).map(r => `${r.customer?.name}: ₹${r.amount - (r.amountPaid || 0)}`).join(", ")}

FORMAT (use emojis, keep it concise, WhatsApp style):
☀️ GOOD MORNING {name}

💰 Cash position
📊 Health score
📅 Next 3 days preview
👁️ 1-2 things to watch today

Keep it warm, helpful, under 200 words.`;

  const result = await generateText({
    model: gateway("openai/gpt-4o-mini"),
    prompt,
  });

  return result.text;
}

export async function generateEveningWrap(ownerId: string): Promise<string> {
  const data = await getBusinessData(ownerId);

  const prompt = `Generate an evening business wrap-up in Hinglish for WhatsApp.

TODAY'S DATA:
- Owner: ${data.owner?.name}
- Today's income: ₹${data.todayIncome.toLocaleString("en-IN")}
- Today's expenses: ₹${data.todayExpenses.toLocaleString("en-IN")}
- End of day cash: ₹${data.currentCash.toLocaleString("en-IN")}
- Tomorrow projection: ₹${data.next3Days[0]?.amount.toLocaleString("en-IN")}

FORMAT:
🌙 TODAY'S WRAP

📥 In: amount
📤 Out: amount
💰 End of day: amount

Brief note about tomorrow

Keep it short, under 100 words.`;

  const result = await generateText({
    model: gateway("openai/gpt-4o-mini"),
    prompt,
  });

  return result.text;
}

export async function generateWeeklySummary(ownerId: string): Promise<string> {
  const data = await getBusinessData(ownerId);

  // Get last week's transactions
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const weekTxns = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: weekAgo } },
  });

  const weekIncome = weekTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const weekExpenses = weekTxns.filter(t => t.type !== "income").reduce((s, t) => s + t.amount, 0);

  const prompt = `Generate a weekly business summary in Hinglish for WhatsApp.

WEEKLY DATA:
- Owner: ${data.owner?.name}
- Business: ${data.owner?.businessName}
- Week's income: ₹${weekIncome.toLocaleString("en-IN")}
- Week's expenses: ₹${weekExpenses.toLocaleString("en-IN")}
- Week's profit: ₹${(weekIncome - weekExpenses).toLocaleString("en-IN")}
- Current cash: ₹${data.currentCash.toLocaleString("en-IN")}
- Health Score: ${data.healthScore.score}/100
- Pending collections: ₹${data.pendingTotal.toLocaleString("en-IN")}

FORMAT:
📊 WEEKLY SUMMARY

Cash change this week
Collections & spending
Health score
What went well (1-2 points)
Watch next week (1-2 points)

Keep it under 150 words.`;

  const result = await generateText({
    model: gateway("openai/gpt-4o-mini"),
    prompt,
  });

  return result.text;
}

export async function generateProfitReport(ownerId: string): Promise<string> {
  const data = await getBusinessData(ownerId);

  // Get expense breakdown
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthTxns = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: startOfMonth }, type: { not: "income" } },
  });

  // Group by category
  const byCategory: Record<string, number> = {};
  for (const txn of monthTxns) {
    byCategory[txn.category || "other"] = (byCategory[txn.category || "other"] || 0) + txn.amount;
  }

  const prompt = `Generate a profit/loss report in Hinglish for WhatsApp.

P&L DATA:
- Business: ${data.owner?.businessName}
- Month: ${now.toLocaleDateString("en-IN", { month: "long" })}
- Revenue: ₹${data.monthIncome.toLocaleString("en-IN")}
- Total Expenses: ₹${data.monthExpenses.toLocaleString("en-IN")}
- Expense breakdown: ${Object.entries(byCategory).map(([cat, amt]) => `${cat}: ₹${amt.toLocaleString("en-IN")}`).join(", ")}
- Profit: ₹${(data.monthIncome - data.monthExpenses).toLocaleString("en-IN")}
- Profit Margin: ${data.monthIncome > 0 ? Math.round(((data.monthIncome - data.monthExpenses) / data.monthIncome) * 100) : 0}%

FORMAT:
📈 P&L REPORT - {month}

Revenue
Expenses by category
Profit amount & margin

Keep it clear, under 150 words.`;

  const result = await generateText({
    model: gateway("openai/gpt-4o-mini"),
    prompt,
  });

  return result.text;
}

// Get owner ID from phone
export async function getOwnerIdFromPhone(phone: string): Promise<string | null> {
  const owner = await db.owner.findUnique({ where: { phone } });
  return owner?.id || null;
}
