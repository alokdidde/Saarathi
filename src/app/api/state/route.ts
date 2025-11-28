import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Phone number required" },
        { status: 400 }
      );
    }

    // Get owner with all related data
    const owner = await db.owner.findUnique({
      where: { phone },
      include: {
        staff: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
        customers: {
          orderBy: { name: "asc" },
        },
        receivables: {
          where: { status: { in: ["pending", "partial"] } },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
        },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        projections: {
          orderBy: { date: "asc" },
          take: 7,
        },
        alerts: {
          where: { status: "pending" },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!owner) {
      return NextResponse.json({
        success: true,
        exists: false,
        data: null,
      });
    }

    // Calculate summary stats
    const totalPending = owner.receivables.reduce(
      (sum, r) => sum + (r.amount - r.amountPaid),
      0
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyTransactions = owner.transactions.filter(
      (t) => t.createdAt >= monthStart
    );

    const monthlyIncome = monthlyTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyExpenses = monthlyTransactions
      .filter((t) => t.type === "expense" || t.type === "salary" || t.type === "advance")
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyProfit = monthlyIncome - monthlyExpenses;

    // Staff salary status
    const staffWithStatus = owner.staff.map((s) => {
      const paidThisMonth = owner.transactions.some(
        (t) =>
          t.staffId === s.id &&
          t.type === "salary" &&
          t.createdAt >= monthStart
      );

      return {
        id: s.id,
        name: s.name,
        salaryAmount: s.salaryAmount,
        salaryType: s.salaryType,
        paymentDay: s.paymentDay,
        advanceBalance: s.advanceBalance,
        paidThisMonth,
        due: paidThisMonth ? 0 : s.salaryAmount - s.advanceBalance,
      };
    });

    const totalSalaryDue = staffWithStatus.reduce((sum, s) => sum + s.due, 0);

    return NextResponse.json({
      success: true,
      exists: true,
      data: {
        owner: {
          id: owner.id,
          phone: owner.phone,
          name: owner.name,
          businessName: owner.businessName,
          businessType: owner.businessType,
          currentCash: owner.currentCash,
          onboardingStep: owner.onboardingStep,
          createdAt: owner.createdAt,
        },
        summary: {
          cash: owner.currentCash,
          pendingReceivables: totalPending,
          salaryDue: totalSalaryDue,
          monthlyIncome,
          monthlyExpenses,
          monthlyProfit,
          staffCount: owner.staff.length,
          customerCount: owner.customers.length,
        },
        staff: staffWithStatus,
        receivables: owner.receivables.map((r) => ({
          id: r.id,
          customerName: r.customer.name,
          amount: r.amount,
          amountPaid: r.amountPaid,
          remaining: r.amount - r.amountPaid,
          status: r.status,
          daysOld: Math.floor(
            (Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
        transactions: owner.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          category: t.category,
          amount: t.amount,
          description: t.description,
          createdAt: t.createdAt,
        })),
        projections: owner.projections.map((p) => ({
          date: p.date,
          projectedCash: p.projectedCash,
          expectedIn: p.expectedIn,
          expectedOut: p.expectedOut,
          confidence: p.confidence,
          flags: p.flags,
        })),
        alerts: owner.alerts,
      },
    });
  } catch (error) {
    console.error("State API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch state" },
      { status: 500 }
    );
  }
}
