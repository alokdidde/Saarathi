import { schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { sendMorningBrief, sendEveningWrap, sendSalaryReminder } from "@/services/brief";

// Morning Brief - 9:00 AM IST daily
export const morningBriefTask = schedules.task({
  id: "morning-brief",
  // Run at 9:00 AM IST (3:30 AM UTC)
  cron: "30 3 * * *",
  run: async () => {
    console.log("Running morning brief task...");

    // Get all owners with completed onboarding
    const owners = await db.owner.findMany({
      where: { onboardingStep: "COMPLETE" },
      select: { id: true, phone: true, name: true },
    });

    console.log(`Sending morning briefs to ${owners.length} owners`);

    for (const owner of owners) {
      try {
        await sendMorningBrief(owner.id);
        console.log(`Morning brief sent to ${owner.name} (${owner.phone})`);
      } catch (error) {
        console.error(`Failed to send morning brief to ${owner.id}:`, error);
      }
    }

    return { sent: owners.length };
  },
});

// Evening Wrap - 8:00 PM IST daily
export const eveningWrapTask = schedules.task({
  id: "evening-wrap",
  // Run at 8:00 PM IST (2:30 PM UTC)
  cron: "30 14 * * *",
  run: async () => {
    console.log("Running evening wrap task...");

    const owners = await db.owner.findMany({
      where: { onboardingStep: "COMPLETE" },
      select: { id: true, phone: true, name: true },
    });

    console.log(`Sending evening wraps to ${owners.length} owners`);

    for (const owner of owners) {
      try {
        await sendEveningWrap(owner.id);
        console.log(`Evening wrap sent to ${owner.name} (${owner.phone})`);
      } catch (error) {
        console.error(`Failed to send evening wrap to ${owner.id}:`, error);
      }
    }

    return { sent: owners.length };
  },
});

// Salary Reminder - 9:00 AM IST daily (checks if salary is due in 3 days)
export const salaryReminderTask = schedules.task({
  id: "salary-reminder",
  // Run at 9:00 AM IST (3:30 AM UTC)
  cron: "30 3 * * *",
  run: async () => {
    console.log("Running salary reminder task...");

    const owners = await db.owner.findMany({
      where: { onboardingStep: "COMPLETE" },
      select: { id: true, phone: true, name: true },
    });

    console.log(`Checking salary reminders for ${owners.length} owners`);

    for (const owner of owners) {
      try {
        await sendSalaryReminder(owner.id);
        console.log(`Salary reminder checked for ${owner.name}`);
      } catch (error) {
        console.error(`Failed to check salary reminder for ${owner.id}:`, error);
      }
    }

    return { checked: owners.length };
  },
});

// Projection Refresh - Every 6 hours
export const projectionRefreshTask = schedules.task({
  id: "projection-refresh",
  // Run every 6 hours
  cron: "0 */6 * * *",
  run: async () => {
    console.log("Running projection refresh task...");

    const owners = await db.owner.findMany({
      where: { onboardingStep: "COMPLETE" },
      select: { id: true },
    });

    console.log(`Refreshing projections for ${owners.length} owners`);

    for (const owner of owners) {
      try {
        await refreshProjections(owner.id);
      } catch (error) {
        console.error(`Failed to refresh projections for ${owner.id}:`, error);
      }
    }

    return { refreshed: owners.length };
  },
});

// Helper: Refresh projections for an owner
async function refreshProjections(ownerId: string): Promise<void> {
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    include: {
      staff: { where: { isActive: true } },
    },
  });

  if (!owner) return;

  // Get historical averages
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historicalTransactions = await db.transaction.findMany({
    where: {
      ownerId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const dailyExpenses = historicalTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0) / 30;

  const dailyIncome = historicalTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0) / 30;

  // Monthly salaries
  const monthlySalaries = owner.staff
    .filter((s) => s.salaryType === "monthly")
    .map((s) => ({
      name: s.name,
      amount: s.salaryAmount - s.advanceBalance,
      day: s.paymentDay || 1,
    }));

  // Generate projections for next 30 days
  let runningCash = owner.currentCash;

  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay();

    // Calculate expected in/out
    const weekendMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.3 : 1;
    const expectedIn = dailyIncome * weekendMultiplier;
    const salariesToday = monthlySalaries
      .filter((s) => s.day === dayOfMonth)
      .reduce((sum, s) => sum + s.amount, 0);
    const expectedOut = dailyExpenses + salariesToday;

    runningCash = runningCash + expectedIn - expectedOut;

    // Determine flags
    const flags: string[] = [];
    if (runningCash < 0) flags.push("negative");
    if (salariesToday > 0) flags.push("salary_due");
    if (runningCash < dailyExpenses * 3 && !flags.includes("negative")) {
      flags.push("low_cash");
    }

    // Determine confidence
    const confidence = i < 3 ? "high" : i < 7 ? "medium" : "low";

    // Upsert projection
    await db.projection.upsert({
      where: {
        ownerId_date: { ownerId, date },
      },
      create: {
        ownerId,
        date,
        projectedCash: Math.round(runningCash),
        expectedIn: Math.round(expectedIn),
        expectedOut: Math.round(expectedOut),
        commitments: salariesToday > 0 ? { salaries: monthlySalaries.filter((s) => s.day === dayOfMonth) } : Prisma.JsonNull,
        confidence,
        flags,
      },
      update: {
        projectedCash: Math.round(runningCash),
        expectedIn: Math.round(expectedIn),
        expectedOut: Math.round(expectedOut),
        commitments: salariesToday > 0 ? { salaries: monthlySalaries.filter((s) => s.day === dayOfMonth) } : Prisma.JsonNull,
        confidence,
        flags,
        generatedAt: new Date(),
      },
    });
  }
}
