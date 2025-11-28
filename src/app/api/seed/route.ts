import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEMO_PHONE = "9876543210";

export async function POST() {
  try {
    console.log("🌱 Seeding database with demo data...");

    // Clear existing data for demo phone
    const existingOwner = await db.owner.findUnique({
      where: { phone: DEMO_PHONE },
    });

    if (existingOwner) {
      await db.alert.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.projection.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.transaction.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.receivable.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.customer.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.staff.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.owner.delete({ where: { id: existingOwner.id } });
    }

    // Create Priya (owner)
    const owner = await db.owner.create({
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
    await db.staff.create({
      data: {
        ownerId: owner.id,
        name: "Ramu",
        salaryAmount: 10000,
        salaryType: "monthly",
        paymentDay: 1,
      },
    });

    await db.staff.create({
      data: {
        ownerId: owner.id,
        name: "Sita",
        salaryAmount: 8000,
        salaryType: "monthly",
        paymentDay: 1,
        advanceBalance: 2000,
      },
    });

    await db.staff.create({
      data: {
        ownerId: owner.id,
        name: "Bunty",
        salaryAmount: 500,
        salaryType: "daily",
      },
    });

    // Create Customers
    const techPark = await db.customer.create({
      data: { ownerId: owner.id, name: "TechPark Office", reliabilityScore: 85 },
    });

    const sharma = await db.customer.create({
      data: { ownerId: owner.id, name: "Sharma Ji", reliabilityScore: 70 },
    });

    const kumar = await db.customer.create({
      data: { ownerId: owner.id, name: "Kumar Family", reliabilityScore: 90 },
    });

    const abcOffice = await db.customer.create({
      data: { ownerId: owner.id, name: "ABC Office", reliabilityScore: 60 },
    });

    const singh = await db.customer.create({
      data: { ownerId: owner.id, name: "Singh Sahab", reliabilityScore: 75 },
    });

    // Helper
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Create Receivables
    await db.receivable.createMany({
      data: [
        { ownerId: owner.id, customerId: techPark.id, amount: 12000, status: "pending", createdAt: daysAgo(5) },
        { ownerId: owner.id, customerId: sharma.id, amount: 5000, status: "pending", createdAt: daysAgo(12) },
        { ownerId: owner.id, customerId: kumar.id, amount: 8000, amountPaid: 3000, status: "partial", createdAt: daysAgo(8) },
        { ownerId: owner.id, customerId: abcOffice.id, amount: 15000, status: "pending", createdAt: daysAgo(18) },
        { ownerId: owner.id, customerId: singh.id, amount: 3000, status: "pending", createdAt: daysAgo(3) },
      ],
    });

    // Create sample transactions (last 7 days)
    const transactions = [];
    for (let i = 7; i >= 1; i--) {
      const date = daysAgo(i);
      const dayOfWeek = date.getDay();
      const baseRevenue = dayOfWeek === 0 || dayOfWeek === 6 ? 3000 : 5000;

      transactions.push({
        ownerId: owner.id,
        type: "income",
        category: "tiffin",
        amount: baseRevenue + Math.floor(Math.random() * 500),
        description: "Tiffin orders",
        createdAt: date,
      });

      transactions.push({
        ownerId: owner.id,
        type: "expense",
        category: "supplies",
        amount: 800 + Math.floor(Math.random() * 300),
        description: "Vegetables & groceries",
        createdAt: date,
      });
    }

    await db.transaction.createMany({ data: transactions });

    // Create projections
    let projectedCash = owner.currentCash;
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);

      const dayOfMonth = date.getDate();
      const expectedIn = 4500;
      const salaryDue = dayOfMonth === 1 ? 16000 : 0;
      const expectedOut = 1200 + salaryDue;

      projectedCash = projectedCash + expectedIn - expectedOut;

      const flags: string[] = [];
      if (projectedCash < 0) flags.push("negative");
      if (salaryDue > 0) flags.push("salary_due");

      await db.projection.create({
        data: {
          ownerId: owner.id,
          date,
          projectedCash: Math.round(projectedCash),
          expectedIn,
          expectedOut,
          confidence: i < 3 ? "high" : "medium",
          flags,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Demo data seeded successfully",
      data: {
        owner: owner.name,
        phone: owner.phone,
        cash: owner.currentCash,
        staff: 3,
        customers: 5,
      },
    });
  } catch (error) {
    console.error("Seed API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to seed data" },
      { status: 500 }
    );
  }
}

// Also support DELETE for clearing data
export async function DELETE() {
  try {
    const existingOwner = await db.owner.findUnique({
      where: { phone: DEMO_PHONE },
    });

    if (existingOwner) {
      await db.alert.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.projection.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.transaction.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.receivable.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.customer.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.staff.deleteMany({ where: { ownerId: existingOwner.id } });
      await db.owner.delete({ where: { id: existingOwner.id } });
    }

    return NextResponse.json({
      success: true,
      message: "Demo data cleared",
    });
  } catch (error) {
    console.error("Clear API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear data" },
      { status: 500 }
    );
  }
}
