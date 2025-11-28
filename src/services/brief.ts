import { db } from "@/lib/db";
import { formatCurrency, formatDate, sendMessage } from "@/lib/whatsapp";

// Generate and send morning brief for an owner
export async function sendMorningBrief(ownerId: string): Promise<void> {
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    include: {
      staff: { where: { isActive: true } },
      receivables: { where: { status: { in: ["pending", "partial"] } } },
    },
  });

  if (!owner || owner.onboardingStep !== "COMPLETE") {
    return;
  }

  const brief = await composeMorningBrief(owner);

  await sendMessage({
    to: owner.phone,
    text: brief,
  });
}

// Compose morning brief content
async function composeMorningBrief(
  owner: NonNullable<Awaited<ReturnType<typeof db.owner.findUnique>>> & {
    staff: Array<{ name: string; salaryAmount: number; salaryType: string; paymentDay: number | null; advanceBalance: number }>;
    receivables: Array<{ amount: number; amountPaid: number }>;
  }
): Promise<string> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Calculate pending amount
  const totalPending = owner.receivables.reduce(
    (sum, r) => sum + (r.amount - r.amountPaid),
    0
  );

  // Get this month's P&L
  const monthlyTransactions = await db.transaction.groupBy({
    by: ["type"],
    where: {
      ownerId: owner.id,
      createdAt: { gte: startOfMonth },
    },
    _sum: { amount: true },
  });

  const income = monthlyTransactions.find((t) => t.type === "income")?._sum.amount || 0;
  const expenses = monthlyTransactions.find((t) => t.type === "expense")?._sum.amount || 0;
  const salaries = monthlyTransactions.find((t) => t.type === "salary")?._sum.amount || 0;
  const totalExpenses = expenses + salaries;
  const profit = income - totalExpenses;
  const profitPercent = income > 0 ? Math.round((profit / income) * 100) : 0;

  // Generate 3-day projection
  const projections = await generate3DayProjection(owner);

  // Find watch items
  const watchItems = await getWatchItems(owner.id, owner.staff, owner.currentCash);

  // Compose the brief
  const monthName = now.toLocaleString("en-IN", { month: "long" });
  const healthEmoji = profit >= 0 ? "💚" : "🟠";

  let brief = `☀️ *GOOD MORNING ${owner.name?.toUpperCase() || ""}*

💰 *CASH POSITION*
In hand: ${formatCurrency(owner.currentCash)}
Pending: ${formatCurrency(totalPending)}

📅 *NEXT 3 DAYS*
${projections.map((p) => `${formatDate(p.date)}: ${formatCurrency(p.cash)} ${p.emoji}`).join("\n")}`;

  if (watchItems.length > 0) {
    brief += `\n\n👁️ *WATCH TODAY*\n${watchItems.map((w, i) => `${i + 1}. ${w}`).join("\n")}`;
  }

  brief += `\n\n📈 *${monthName.toUpperCase()}*
Revenue: ${formatCurrency(income)}
Expenses: ${formatCurrency(totalExpenses)}
Profit: ${formatCurrency(profit)} (${profitPercent}%) ${healthEmoji}

Have a great day! 🙏`;

  return brief;
}

// Generate 3-day projection for morning brief
async function generate3DayProjection(
  owner: NonNullable<Awaited<ReturnType<typeof db.owner.findUnique>>> & {
    staff: Array<{ name: string; salaryAmount: number; salaryType: string; paymentDay: number | null; advanceBalance: number }>;
  }
): Promise<Array<{ date: Date; cash: number; emoji: string }>> {
  const projections: Array<{ date: Date; cash: number; emoji: string }> = [];
  let runningCash = owner.currentCash;

  // Get daily expense average
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const avgDailyExpense = await db.transaction.aggregate({
    where: {
      ownerId: owner.id,
      type: "expense",
      createdAt: { gte: thirtyDaysAgo },
    },
    _avg: { amount: true },
  });

  const dailyExpense = avgDailyExpense._avg.amount || 2000;

  // Monthly salaries
  const monthlySalaries = owner.staff
    .filter((s) => s.salaryType === "monthly")
    .map((s) => ({
      amount: s.salaryAmount - s.advanceBalance,
      day: s.paymentDay || 1,
    }));

  for (let i = 0; i < 3; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayOfMonth = date.getDate();

    // Check for salary
    const salariesToday = monthlySalaries
      .filter((s) => s.day === dayOfMonth)
      .reduce((sum, s) => sum + s.amount, 0);

    runningCash = runningCash - dailyExpense - salariesToday;

    let emoji = "✓";
    if (runningCash < 0) {
      emoji = "🔴";
    } else if (salariesToday > 0) {
      emoji = "⚠️ Salary!";
    } else if (runningCash < dailyExpense * 2) {
      emoji = "🟡";
    }

    projections.push({ date, cash: Math.round(runningCash), emoji });
  }

  return projections;
}

// Get watch items for the day
async function getWatchItems(
  ownerId: string,
  staff: Array<{ name: string; salaryAmount: number; salaryType: string; paymentDay: number | null; advanceBalance: number }>,
  currentCash: number
): Promise<string[]> {
  const items: string[] = [];
  const now = new Date();

  // Check for upcoming salary
  const daysUntilSalary = staff
    .filter((s) => s.salaryType === "monthly" && s.paymentDay)
    .map((s) => {
      const salaryDay = s.paymentDay!;
      const today = now.getDate();
      const daysLeft = salaryDay >= today ? salaryDay - today : 30 - today + salaryDay;
      return { name: s.name, daysLeft, amount: s.salaryAmount - s.advanceBalance };
    })
    .filter((s) => s.daysLeft <= 5);

  if (daysUntilSalary.length > 0) {
    const total = daysUntilSalary.reduce((sum, s) => sum + s.amount, 0);
    const days = Math.min(...daysUntilSalary.map((s) => s.daysLeft));
    if (currentCash < total) {
      items.push(`🔴 Salary in ${days} days - ${formatCurrency(total - currentCash)} short`);
    } else {
      items.push(`💰 Salary in ${days} days - ${formatCurrency(total)} covered`);
    }
  }

  // Check for overdue receivables
  const overdueReceivables = await db.receivable.findMany({
    where: {
      ownerId,
      status: { in: ["pending", "partial"] },
      createdAt: {
        lt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      },
    },
    include: { customer: true },
    orderBy: { amount: "desc" },
    take: 1,
  });

  if (overdueReceivables.length > 0) {
    const r = overdueReceivables[0];
    const daysOld = Math.floor((now.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    items.push(`⚠️ ${r.customer.name} ${formatCurrency(r.amount - r.amountPaid)} (${daysOld} days)`);
  }

  return items;
}

// Send evening wrap-up
export async function sendEveningWrap(ownerId: string): Promise<void> {
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
  });

  if (!owner || owner.onboardingStep !== "COMPLETE") {
    return;
  }

  const wrap = await composeEveningWrap(owner);

  await sendMessage({
    to: owner.phone,
    text: wrap,
  });
}

// Compose evening wrap content
async function composeEveningWrap(
  owner: NonNullable<Awaited<ReturnType<typeof db.owner.findUnique>>>
): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get today's transactions
  const todayTransactions = await db.transaction.findMany({
    where: {
      ownerId: owner.id,
      createdAt: { gte: today },
    },
  });

  const todayIn = todayTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const todayOut = todayTransactions
    .filter((t) => t.type !== "income")
    .reduce((sum, t) => sum + t.amount, 0);

  // Get income sources
  const incomeSources = todayTransactions
    .filter((t) => t.type === "income")
    .map((t) => t.description || "Payment")
    .slice(0, 2);

  let wrap = `🌙 *TODAY'S WRAP*\n`;

  if (todayIn > 0) {
    wrap += `\n📥 In: ${formatCurrency(todayIn)}`;
    if (incomeSources.length > 0) {
      wrap += ` (${incomeSources.join(", ")})`;
    }
  }

  if (todayOut > 0) {
    wrap += `\n📤 Out: ${formatCurrency(todayOut)}`;
  }

  wrap += `\n💰 End of day: ${formatCurrency(owner.currentCash)}`;

  // Tomorrow preview
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.getDate();

  // Check for salary tomorrow
  const staffWithSalaryTomorrow = await db.staff.findFirst({
    where: {
      ownerId: owner.id,
      salaryType: "monthly",
      paymentDay: tomorrowDay,
    },
  });

  wrap += `\n\n📅 Tomorrow:`;
  if (staffWithSalaryTomorrow) {
    wrap += `\n⚠️ Salary day!`;
  } else {
    wrap += `\n✓ Normal day`;
  }

  wrap += `\n\nGood night! 🌙`;

  return wrap;
}

// Send salary reminder alert
export async function sendSalaryReminder(ownerId: string): Promise<void> {
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    include: {
      staff: { where: { isActive: true, salaryType: "monthly" } },
    },
  });

  if (!owner || owner.onboardingStep !== "COMPLETE") {
    return;
  }

  const now = new Date();
  const currentDay = now.getDate();

  // Find staff with salary due in 3 days
  const staffWithUpcomingSalary = owner.staff.filter((s) => {
    if (!s.paymentDay) return false;
    const daysUntil = s.paymentDay >= currentDay
      ? s.paymentDay - currentDay
      : 30 - currentDay + s.paymentDay;
    return daysUntil === 3;
  });

  if (staffWithUpcomingSalary.length === 0) {
    return;
  }

  const totalDue = staffWithUpcomingSalary.reduce(
    (sum, s) => sum + (s.salaryAmount - s.advanceBalance),
    0
  );

  const shortfall = totalDue - owner.currentCash;

  let alert: string;

  if (shortfall > 0) {
    // Get pending receivables for suggestion
    const pendingReceivables = await db.receivable.findMany({
      where: { ownerId: owner.id, status: "pending" },
      include: { customer: true },
      orderBy: { amount: "desc" },
      take: 2,
    });

    alert = `📅 *SALARY ALERT* ⚠️

Due in 3 days:
${staffWithUpcomingSalary.map((s) => `• ${s.name}: ${formatCurrency(s.salaryAmount - s.advanceBalance)}`).join("\n")}
Total: ${formatCurrency(totalDue)}

💰 Current cash: ${formatCurrency(owner.currentCash)}
📉 Shortfall: ${formatCurrency(shortfall)}`;

    if (pendingReceivables.length > 0) {
      alert += `\n\n💡 *To cover this:*`;
      for (const r of pendingReceivables) {
        alert += `\n• ${r.customer.name}: ${formatCurrency(r.amount)}`;
      }
    }
  } else {
    alert = `📅 *SALARY REMINDER*

Due in 3 days:
${staffWithUpcomingSalary.map((s) => `• ${s.name}: ${formatCurrency(s.salaryAmount - s.advanceBalance)}`).join("\n")}
Total: ${formatCurrency(totalDue)}

💰 Cash: ${formatCurrency(owner.currentCash)}
✅ Status: Covered`;
  }

  await sendMessage({
    to: owner.phone,
    text: alert,
  });
}
