import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

// Create Prisma client with adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Demo phone number for Priya
const DEMO_PHONE = "9876543210";

async function main() {
  console.log("🌱 Seeding database with Priya's Tiffin Service demo data...\n");

  // Clear existing data for demo phone
  console.log("🗑️  Clearing existing demo data...");
  const existingOwner = await prisma.owner.findUnique({
    where: { phone: DEMO_PHONE },
  });

  if (existingOwner) {
    await prisma.alert.deleteMany({ where: { ownerId: existingOwner.id } });
    await prisma.projection.deleteMany({ where: { ownerId: existingOwner.id } });
    await prisma.transaction.deleteMany({ where: { ownerId: existingOwner.id } });
    await prisma.receivable.deleteMany({ where: { ownerId: existingOwner.id } });
    await prisma.customer.deleteMany({ where: { ownerId: existingOwner.id } });
    await prisma.staff.deleteMany({ where: { ownerId: existingOwner.id } });
    await prisma.owner.delete({ where: { id: existingOwner.id } });
  }

  // Create Priya (owner)
  console.log("👤 Creating owner: Priya's Tiffin Service...");
  const owner = await prisma.owner.create({
    data: {
      phone: DEMO_PHONE,
      name: "Priya",
      businessName: "Priya's Tiffin Service",
      businessType: "food",
      currentCash: 28500,
      language: "hi",
      onboardingStep: "COMPLETE",
    },
  });

  // Create Staff
  console.log("👥 Creating staff members...");
  const ramu = await prisma.staff.create({
    data: {
      ownerId: owner.id,
      name: "Ramu",
      salaryAmount: 10000,
      salaryType: "monthly",
      paymentDay: 1,
      advanceBalance: 0,
    },
  });

  const sita = await prisma.staff.create({
    data: {
      ownerId: owner.id,
      name: "Sita",
      salaryAmount: 8000,
      salaryType: "monthly",
      paymentDay: 1,
      advanceBalance: 2000, // Has advance
    },
  });

  const bunty = await prisma.staff.create({
    data: {
      ownerId: owner.id,
      name: "Bunty",
      salaryAmount: 500,
      salaryType: "daily",
      paymentDay: null,
      advanceBalance: 0,
    },
  });

  console.log(`   - Ramu: ₹10,000/month (1st)`);
  console.log(`   - Sita: ₹8,000/month (1st) - ₹2,000 advance taken`);
  console.log(`   - Bunty: ₹500/day`);

  // Create Customers with pending amounts
  console.log("\n👥 Creating customers with pending payments...");

  const techPark = await prisma.customer.create({
    data: {
      ownerId: owner.id,
      name: "TechPark Office",
      phone: "9999888801",
      reliabilityScore: 85,
      avgDaysToPay: 5,
    },
  });

  const sharma = await prisma.customer.create({
    data: {
      ownerId: owner.id,
      name: "Sharma Ji",
      phone: "9999888802",
      reliabilityScore: 70,
      avgDaysToPay: 10,
    },
  });

  const kumar = await prisma.customer.create({
    data: {
      ownerId: owner.id,
      name: "Kumar Family",
      phone: "9999888803",
      reliabilityScore: 90,
      avgDaysToPay: 3,
    },
  });

  const abcOffice = await prisma.customer.create({
    data: {
      ownerId: owner.id,
      name: "ABC Office",
      phone: "9999888804",
      reliabilityScore: 60,
      avgDaysToPay: 14,
    },
  });

  const singh = await prisma.customer.create({
    data: {
      ownerId: owner.id,
      name: "Singh Sahab",
      phone: "9999888805",
      reliabilityScore: 75,
      avgDaysToPay: 7,
    },
  });

  // Create Receivables (pending payments)
  console.log("💰 Creating pending receivables...");

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  await prisma.receivable.create({
    data: {
      ownerId: owner.id,
      customerId: techPark.id,
      amount: 12000,
      amountPaid: 0,
      status: "pending",
      createdAt: daysAgo(5),
    },
  });

  await prisma.receivable.create({
    data: {
      ownerId: owner.id,
      customerId: sharma.id,
      amount: 5000,
      amountPaid: 0,
      status: "pending",
      createdAt: daysAgo(12),
    },
  });

  await prisma.receivable.create({
    data: {
      ownerId: owner.id,
      customerId: kumar.id,
      amount: 8000,
      amountPaid: 3000,
      status: "partial",
      createdAt: daysAgo(8),
    },
  });

  await prisma.receivable.create({
    data: {
      ownerId: owner.id,
      customerId: abcOffice.id,
      amount: 15000,
      amountPaid: 0,
      status: "pending",
      createdAt: daysAgo(18),
    },
  });

  await prisma.receivable.create({
    data: {
      ownerId: owner.id,
      customerId: singh.id,
      amount: 3000,
      amountPaid: 0,
      status: "pending",
      createdAt: daysAgo(3),
    },
  });

  console.log("   - TechPark Office: ₹12,000 (5 days old)");
  console.log("   - Sharma Ji: ₹5,000 (12 days old)");
  console.log("   - Kumar Family: ₹8,000 (₹3,000 paid)");
  console.log("   - ABC Office: ₹15,000 (18 days old)");
  console.log("   - Singh Sahab: ₹3,000 (3 days old)");
  console.log("   Total Pending: ₹40,000");

  // Create 14 days of transaction history
  console.log("\n📊 Creating 14 days of transaction history...");

  const transactions: Array<{
    type: string;
    category: string | null;
    amount: number;
    description: string;
    createdAt: Date;
    customerId?: string;
    staffId?: string;
  }> = [];

  // Daily revenue pattern (tiffin orders)
  for (let i = 14; i >= 1; i--) {
    const date = daysAgo(i);
    const dayOfWeek = date.getDay();

    // Higher revenue on weekdays (office orders)
    const baseRevenue = dayOfWeek === 0 || dayOfWeek === 6 ? 3000 : 5000;
    const variance = Math.floor(Math.random() * 1000) - 500;
    const dailyRevenue = baseRevenue + variance;

    transactions.push({
      type: "income",
      category: "tiffin",
      amount: dailyRevenue,
      description: `Tiffin orders - ${date.toLocaleDateString("en-IN")}`,
      createdAt: date,
    });

    // Daily expenses
    const dailyExpenses = [
      { category: "supplies", amount: 800 + Math.floor(Math.random() * 400), description: "Vegetables & groceries" },
      { category: "utilities", amount: 100 + Math.floor(Math.random() * 50), description: "Gas cylinder share" },
    ];

    // Add transport on some days
    if (i % 3 === 0) {
      dailyExpenses.push({ category: "transport", amount: 200, description: "Delivery transport" });
    }

    for (const exp of dailyExpenses) {
      transactions.push({
        type: "expense",
        category: exp.category,
        amount: exp.amount,
        description: exp.description,
        createdAt: date,
      });
    }

    // Bunty's daily wage (not all days)
    if (dayOfWeek !== 0 && i % 2 === 0) {
      transactions.push({
        type: "salary",
        category: "salary",
        amount: 500,
        description: "Bunty daily wage",
        createdAt: date,
        staffId: bunty.id,
      });
    }
  }

  // Add some customer payments received
  transactions.push({
    type: "income",
    category: "payment",
    amount: 8000,
    description: "Payment from Kumar Family",
    createdAt: daysAgo(10),
    customerId: kumar.id,
  });

  transactions.push({
    type: "income",
    category: "payment",
    amount: 3000,
    description: "Partial payment from Kumar Family",
    createdAt: daysAgo(4),
    customerId: kumar.id,
  });

  // Add Sita's advance
  transactions.push({
    type: "advance",
    category: "advance",
    amount: 2000,
    description: "Advance to Sita",
    createdAt: daysAgo(7),
    staffId: sita.id,
  });

  // Insert all transactions
  for (const t of transactions) {
    await prisma.transaction.create({
      data: {
        ownerId: owner.id,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description,
        createdAt: t.createdAt,
        customerId: t.customerId || null,
        staffId: t.staffId || null,
        source: "text",
      },
    });
  }

  console.log(`   Created ${transactions.length} transactions`);

  // Create projections for next 7 days
  console.log("\n📅 Creating 7-day projections...");

  let projectedCash = owner.currentCash;
  const avgDailyIncome = 4500;
  const avgDailyExpense = 1200;

  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay();

    // Weekend boost
    const incomeMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;
    const expectedIn = Math.round(avgDailyIncome * incomeMultiplier);

    // Check for salary day (1st of month)
    let salaryDue = 0;
    if (dayOfMonth === 1) {
      salaryDue = 10000 + 8000 - 2000; // Ramu + Sita (minus advance)
    }

    const expectedOut = avgDailyExpense + salaryDue;
    projectedCash = projectedCash + expectedIn - expectedOut;

    const flags: string[] = [];
    if (projectedCash < 0) flags.push("negative");
    if (salaryDue > 0) flags.push("salary_due");
    if (projectedCash < avgDailyExpense * 3 && projectedCash >= 0) flags.push("low_cash");

    await prisma.projection.create({
      data: {
        ownerId: owner.id,
        date,
        projectedCash: Math.round(projectedCash),
        expectedIn,
        expectedOut,
        commitments: salaryDue > 0 ? { salaries: [{ name: "Ramu", amount: 10000 }, { name: "Sita", amount: 6000 }] } : undefined,
        confidence: i < 3 ? "high" : i < 5 ? "medium" : "low",
        flags,
      },
    });
  }

  console.log("   Created 7 days of projections");

  // Summary
  console.log("\n✅ Seed completed successfully!");
  console.log("\n📋 Summary:");
  console.log(`   Owner: ${owner.name} (${owner.businessName})`);
  console.log(`   Phone: ${owner.phone}`);
  console.log(`   Cash: ₹${owner.currentCash.toLocaleString("en-IN")}`);
  console.log(`   Staff: 3 (Ramu, Sita, Bunty)`);
  console.log(`   Customers: 5`);
  console.log(`   Pending: ₹40,000`);
  console.log(`   Transactions: ${transactions.length}`);
  console.log("\n🚀 Ready to test! Open /simulator and use phone: 9876543210");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
