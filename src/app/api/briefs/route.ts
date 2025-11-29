import { NextRequest, NextResponse } from "next/server";
import {
  generateMorningBrief,
  generateEveningWrap,
  generateWeeklySummary,
  generateProfitReport,
  calculateHealthScore,
  getOwnerIdFromPhone,
} from "@/lib/briefs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, type } = body;

    if (!phone || !type) {
      return NextResponse.json(
        { error: "Phone and type are required" },
        { status: 400 }
      );
    }

    const ownerId = await getOwnerIdFromPhone(phone);
    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner not found" },
        { status: 404 }
      );
    }

    let content: string;
    let title: string;

    switch (type) {
      case "morning":
        title = "Morning Brief";
        content = await generateMorningBrief(ownerId);
        break;
      case "evening":
        title = "Evening Wrap";
        content = await generateEveningWrap(ownerId);
        break;
      case "weekly":
        title = "Weekly Summary";
        content = await generateWeeklySummary(ownerId);
        break;
      case "profit":
        title = "Profit & Loss";
        content = await generateProfitReport(ownerId);
        break;
      case "health":
        title = "Health Score";
        const healthData = await calculateHealthScore(ownerId);
        content = formatHealthScore(healthData);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid type. Use: morning, evening, weekly, profit, health" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      title,
      content,
      type,
    });
  } catch (error) {
    console.error("Brief API error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief", details: String(error) },
      { status: 500 }
    );
  }
}

function formatHealthScore(data: Awaited<ReturnType<typeof calculateHealthScore>>): string {
  const statusEmoji = {
    excellent: "💚",
    good: "💛",
    caution: "🟠",
    critical: "🔴",
  };

  const statusText = {
    excellent: "Excellent - Business thriving!",
    good: "Good - Healthy business",
    caution: "Caution - Needs attention",
    critical: "Critical - Action needed",
  };

  const bar = (score: number) => {
    const filled = Math.round(score / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  return `${statusEmoji[data.status]} HEALTH SCORE: ${data.score}/100
"${statusText[data.status]}"

┌─────────────────────────────────────┐
│ Cash Runway      ${bar(data.components.cashRunway.score)}  ${data.components.cashRunway.score}    │
│                  (${data.components.cashRunway.days} days)
│ Profit Margin    ${bar(data.components.profitMargin.score)}  ${data.components.profitMargin.score}    │
│                  (${data.components.profitMargin.percentage}%)
│ Collection Speed ${bar(data.components.collectionSpeed.score)}  ${data.components.collectionSpeed.score}    │
│                  (${data.components.collectionSpeed.avgDays} days avg)
│ Expense Control  ${bar(data.components.expenseControl.score)}  ${data.components.expenseControl.score}    │
│                  (${data.components.expenseControl.vsAverage > 0 ? "+" : ""}${data.components.expenseControl.vsAverage}% vs last)
│ Growth Trend     ${bar(data.components.growthTrend.score)}  ${data.components.growthTrend.score}    │
│                  (${data.components.growthTrend.percentage > 0 ? "+" : ""}${data.components.growthTrend.percentage}% growth)
└─────────────────────────────────────┘`;
}
