import { db, type Owner } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/whatsapp";

interface QueryResponse {
  text: string;
  ownerId: string;
}

type OwnerWithRelations = Owner & {
  staff?: Array<{ id: string; name: string; salaryAmount: number; salaryType: string; paymentDay: number | null; advanceBalance: number }>;
  customers?: Array<{ id: string; name: string }>;
};

// Status query - full business snapshot
export async function handleStatusQuery(owner: OwnerWithRelations): Promise<QueryResponse> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get pending receivables
  const pendingReceivables = await db.receivable.aggregate({
    where: { ownerId: owner.id, status: { in: ["pending", "partial"] } },
    _sum: { amount: true, amountPaid: true },
  });
  const totalPending = (pendingReceivables._sum.amount || 0) - (pendingReceivables._sum.amountPaid || 0);

  // Get this month's transactions
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

  // Get staff salary info
  const staffList = owner.staff || [];
  const monthlyStaff = staffList.filter((s) => s.salaryType === "monthly");
  const totalMonthlySalary = monthlyStaff.reduce((sum, s) => sum + s.salaryAmount, 0);

  // Calculate remaining salaries
  const paidSalaries = salaries;
  const remainingSalaries = Math.max(0, totalMonthlySalary - paidSalaries);

  // Determine health emoji
  const healthEmoji = profit >= 0 ? "💚" : "🔴";
  const statusEmoji = owner.currentCash >= remainingSalaries ? "✅" : "⚠️";

  const response = `📊 *BUSINESS STATUS*
━━━━━━━━━━━━━━━━━━

💰 *Cash:* ${formatCurrency(owner.currentCash)}
📥 *Pending:* ${formatCurrency(totalPending)}
📤 *Due:* ${formatCurrency(remainingSalaries)} (salaries)

${healthEmoji} *${now.toLocaleString("en-IN", { month: "long" })}:*
• Revenue: ${formatCurrency(income)}
• Expenses: ${formatCurrency(totalExpenses)}
• Profit: ${formatCurrency(profit)} (${profitPercent}%)

${statusEmoji} Salary coverage: ${owner.currentCash >= remainingSalaries ? "OK" : `₹${remainingSalaries - owner.currentCash} short`}`;

  return {
    text: response,
    ownerId: owner.id,
  };
}

// Projection query - 7-day cash forecast
export async function handleProjectionQuery(owner: OwnerWithRelations): Promise<QueryResponse> {
  const projections = await generateProjections(owner);

  const lines = projections.map((p) => {
    const dateStr = formatDate(p.date);
    const cashStr = formatCurrency(p.cash).padStart(10);
    const statusEmoji = p.flags.includes("negative")
      ? "🔴"
      : p.flags.includes("salary_due")
      ? "⚠️"
      : p.flags.includes("low_cash")
      ? "🟡"
      : "✓";
    const note = p.note ? ` ${p.note}` : "";
    return `${dateStr}: ${cashStr} ${statusEmoji}${note}`;
  });

  // Find problem days
  const problemDays = projections.filter((p) => p.flags.includes("negative") || p.flags.includes("salary_due"));

  let response = `📅 *NEXT 7 DAYS*

Starting: ${formatCurrency(owner.currentCash)}

${lines.join("\n")}`;

  if (problemDays.length > 0) {
    const firstProblem = problemDays[0];
    response += `\n\n⚠️ *${formatDate(firstProblem.date)}:* ${firstProblem.note}`;

    // Add suggestion
    const pendingReceivables = await db.receivable.findMany({
      where: { ownerId: owner.id, status: "pending" },
      include: { customer: true },
      orderBy: { amount: "desc" },
      take: 2,
    });

    if (pendingReceivables.length > 0) {
      response += `\n\n💡 *Collect from:*`;
      for (const r of pendingReceivables) {
        response += `\n• ${r.customer.name}: ${formatCurrency(r.amount)}`;
      }
    }
  }

  return {
    text: response,
    ownerId: owner.id,
  };
}

// Pending query - list receivables
export async function handlePendingQuery(owner: OwnerWithRelations): Promise<QueryResponse> {
  const receivables = await db.receivable.findMany({
    where: { ownerId: owner.id, status: { in: ["pending", "partial"] } },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });

  if (receivables.length === 0) {
    return {
      text: "✅ No pending payments! Sab clear hai.",
      ownerId: owner.id,
    };
  }

  const total = receivables.reduce((sum, r) => sum + (r.amount - r.amountPaid), 0);

  const lines = receivables.map((r) => {
    const remaining = r.amount - r.amountPaid;
    const daysOld = Math.floor((Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const statusEmoji = daysOld > 14 ? "⚠️" : daysOld > 7 ? "🟡" : "";
    return `• ${r.customer.name}: ${formatCurrency(remaining)} (${daysOld}d) ${statusEmoji}`;
  });

  return {
    text: `📋 *PENDING PAYMENTS*\n\nTotal: ${formatCurrency(total)}\n\n${lines.join("\n")}\n\nRemind karna hai? Name bolo.`,
    ownerId: owner.id,
  };
}

// Staff query - salary status
export async function handleStaffQuery(owner: OwnerWithRelations): Promise<QueryResponse> {
  const staffList = owner.staff || [];

  if (staffList.length === 0) {
    return {
      text: "👥 No staff registered.\n\nAdd staff: \"Ramu 10000 monthly 1st\"",
      ownerId: owner.id,
    };
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const lines: string[] = [];
  let totalDue = 0;

  for (const staff of staffList) {
    // Check if salary paid this month
    const paidThisMonth = await db.transaction.findFirst({
      where: {
        ownerId: owner.id,
        staffId: staff.id,
        type: "salary",
        createdAt: { gte: startOfMonth },
      },
    });

    if (staff.salaryType === "monthly") {
      if (paidThisMonth) {
        lines.push(`• ${staff.name}: ✅ Paid`);
      } else {
        const due = staff.salaryAmount - staff.advanceBalance;
        totalDue += due;
        lines.push(`• ${staff.name}: ${formatCurrency(due)} pending${staff.advanceBalance > 0 ? ` (after ₹${staff.advanceBalance} advance)` : ""}`);
      }
    } else {
      lines.push(`• ${staff.name}: ${formatCurrency(staff.salaryAmount)}/day`);
    }
  }

  let response = `👥 *STAFF STATUS*\n\n${lines.join("\n")}`;

  if (totalDue > 0) {
    response += `\n\n💰 Total pending: ${formatCurrency(totalDue)}`;
    response += owner.currentCash >= totalDue
      ? `\n✅ Cash available: ${formatCurrency(owner.currentCash)}`
      : `\n⚠️ Cash: ${formatCurrency(owner.currentCash)} (${formatCurrency(totalDue - owner.currentCash)} short)`;
  }

  return {
    text: response,
    ownerId: owner.id,
  };
}

// Profit query - P&L for current month
export async function handleProfitQuery(owner: OwnerWithRelations): Promise<QueryResponse> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthName = now.toLocaleString("en-IN", { month: "long" });

  // Get transactions grouped by type and category
  const transactions = await db.transaction.findMany({
    where: {
      ownerId: owner.id,
      createdAt: { gte: startOfMonth },
    },
  });

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  // Group expenses by category
  const expensesByCategory: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type === "expense" || t.type === "salary" || t.type === "advance") {
      const category = t.category || "other";
      expensesByCategory[category] = (expensesByCategory[category] || 0) + t.amount;
    }
  }

  const totalExpenses = Object.values(expensesByCategory).reduce((sum, v) => sum + v, 0);
  const profit = income - totalExpenses;
  const profitPercent = income > 0 ? Math.round((profit / income) * 100) : 0;

  // Format expense lines
  const expenseLines = Object.entries(expensesByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => {
      const percent = income > 0 ? Math.round((amount / income) * 100) : 0;
      const label = category.charAt(0).toUpperCase() + category.slice(1);
      return `• ${label}: ${formatCurrency(amount)} (${percent}%)`;
    });

  const profitEmoji = profit >= 0 ? "🎉" : "⚠️";

  return {
    text: `📈 *${monthName.toUpperCase()} P&L*

Revenue: ${formatCurrency(income)}
━━━━━━━━━━━━━━━━━━
*Expenses:*
${expenseLines.join("\n")}
━━━━━━━━━━━━━━━━━━
Total: ${formatCurrency(totalExpenses)}
━━━━━━━━━━━━━━━━━━
*PROFIT: ${formatCurrency(profit)} (${profitPercent}%)* ${profitEmoji}`,
    ownerId: owner.id,
  };
}

// Helper: Generate 7-day projections
async function generateProjections(
  owner: OwnerWithRelations
): Promise<Array<{ date: Date; cash: number; flags: string[]; note?: string }>> {
  const projections: Array<{ date: Date; cash: number; flags: string[]; note?: string }> = [];
  let runningCash = owner.currentCash;

  // Get historical averages (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historicalTransactions = await db.transaction.findMany({
    where: {
      ownerId: owner.id,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Calculate daily averages
  const dailyExpenses = historicalTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0) / 30;

  const dailyIncome = historicalTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0) / 30;

  // Get staff salary dates
  const staff = owner.staff || [];
  const monthlySalaries = staff
    .filter((s) => s.salaryType === "monthly")
    .map((s) => ({
      name: s.name,
      amount: s.salaryAmount - s.advanceBalance,
      day: s.paymentDay || 1,
    }));

  // Generate projections for next 7 days
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay();

    const flags: string[] = [];
    let note = "";

    // Check for salary day
    const salariesDue = monthlySalaries.filter((s) => s.day === dayOfMonth);
    const salaryAmount = salariesDue.reduce((sum, s) => sum + s.amount, 0);

    // Estimate daily cash flow
    const expectedIn = dailyIncome * (dayOfWeek === 0 || dayOfWeek === 6 ? 1.3 : 1); // Weekend boost
    const expectedOut = dailyExpenses + salaryAmount;

    runningCash = runningCash + expectedIn - expectedOut;

    // Flag problem days
    if (runningCash < 0) {
      flags.push("negative");
      note = `🔴 ${formatCurrency(Math.abs(runningCash))} short!`;
    } else if (salaryAmount > 0) {
      flags.push("salary_due");
      note = `Salary day`;
      if (runningCash < salaryAmount) {
        note += ` - ${formatCurrency(salaryAmount - runningCash)} short`;
      }
    } else if (runningCash < dailyExpenses * 3) {
      flags.push("low_cash");
      note = "Low buffer";
    }

    projections.push({ date, cash: Math.round(runningCash), flags, note });
  }

  return projections;
}
