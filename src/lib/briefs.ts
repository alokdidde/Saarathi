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

  // Calculate 7-day projection with daily details
  const now = new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get staff salary schedule
  const salaryByDay: Record<number, number> = {};
  for (const s of data.staff) {
    const day = s.paymentDay || 1;
    salaryByDay[day] = (salaryByDay[day] || 0) + (s.salaryAmount - s.advanceBalance);
  }

  // Calculate daily expense average
  const dailyExpense = data.monthExpenses / Math.max(now.getDate(), 1);

  // Build 7-day projection data
  let runningCash = data.currentCash;
  const projections = [];
  let problemDay = null;

  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dayOfMonth = date.getDate();
    const dayName = dayNames[date.getDay()];
    const salaryDue = salaryByDay[dayOfMonth] || 0;

    runningCash -= dailyExpense;
    if (salaryDue > 0) runningCash -= salaryDue;

    const isProblem = runningCash < 0;
    if (isProblem && !problemDay) {
      problemDay = { day: dayName, salaryDue, cashBefore: runningCash + salaryDue + dailyExpense, shortfall: Math.abs(runningCash) };
    }

    projections.push({
      day: dayName,
      cash: Math.round(runningCash),
      hasSalary: salaryDue > 0,
      salaryAmount: salaryDue,
      isProblem,
    });
  }

  // Get oldest pending receivables
  const oldestReceivables = data.receivables.slice(0, 3).map(r => ({
    name: r.customer?.name || "Customer",
    amount: r.amount - (r.amountPaid || 0),
    daysOld: Math.floor((now.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  const prompt = `Generate a morning cash flow forecast in Hinglish for WhatsApp. This is the HERO feature - a 7-day look-ahead showing exactly when money problems will hit.

BUSINESS DATA:
- Owner: ${data.owner?.name}
- Current cash: ₹${data.currentCash.toLocaleString("en-IN")}
- Daily avg expense: ₹${Math.round(dailyExpense).toLocaleString("en-IN")}
- Total monthly salary: ₹${data.monthlyPayroll.toLocaleString("en-IN")}

7-DAY PROJECTION:
${projections.map(p => `${p.day}: ₹${p.cash.toLocaleString("en-IN")} ${p.hasSalary ? `(salary ₹${p.salaryAmount})` : ""} ${p.isProblem ? "⚠️ PROBLEM" : "OK"}`).join("\n")}

${problemDay ? `PROBLEM DAY: ${problemDay.day} - Need ₹${problemDay.salaryDue} for salary, only ₹${Math.max(0, problemDay.cashBefore)} available, ₹${problemDay.shortfall} short` : "No problem days this week"}

PENDING COLLECTIONS (oldest first):
${oldestReceivables.map(r => `${r.name}: ₹${r.amount.toLocaleString("en-IN")} pending for ${r.daysOld} days`).join("\n") || "None"}

INSTRUCTIONS FOR PRESENTATION:
1. Show a 7-day forecast as a simple list - each day on one line with: day name, status emoji, projected cash, brief note about what's happening (expenses, salary, etc.)
2. Use simple status indicators: ✅ for OK days, ⚠️ for tight days, 🔴 for problem days, ↗️ for recovery/weekend days
3. If there's a PROBLEM DAY (cash goes negative), highlight it separately:
   - Use a blank line before/after to separate it visually
   - Call out which day is the problem
   - Show how much is needed (salary/expenses)
   - Show how much cash will be available
   - Show the SHORTFALL amount prominently
4. End with ACTION ITEMS: which customers to follow up with to collect money, showing name, amount, and how many days overdue
5. Use Hinglish naturally - mix Hindi phrases like "sab theek", "thoda tight", "dikkat wala din", "paisa kam padega"
6. Keep it scannable - owner should understand cash situation in 5 seconds
7. Use blank lines to separate sections. Do NOT use long dashes or separator lines - they break on mobile screens.
8. Keep each line short (under 35 characters) so it fits in a WhatsApp chat bubble without wrapping badly.

The goal: Owner sees immediately "Which day will I have a problem?" and "What should I do about it?"`;

  const result = await generateText({
    model: gateway("anthropic/claude-sonnet-4"),
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
