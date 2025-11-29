import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { db } from "./db";

// Get business context for the system prompt
async function getBusinessContext(ownerId: string) {
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    include: {
      staff: { where: { isActive: true } },
      customers: true,
    },
  });

  const receivables = await db.receivable.findMany({
    where: { ownerId, status: { in: ["pending", "partial"] } },
    include: { customer: true },
  });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const transactions = await db.transaction.findMany({
    where: { ownerId, createdAt: { gte: startOfMonth } },
  });

  const monthlyIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthlyExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return { owner, staff: owner?.staff || [], customers: owner?.customers || [], receivables, monthlyIncome, monthlyExpenses };
}

// Create agent with tools for a specific owner
function createBusinessAgent(ownerId: string, context: Awaited<ReturnType<typeof getBusinessContext>>, hasImage: boolean = false) {
  const imageInstructions = hasImage ? `

IMAGE ANALYSIS RULES:
You have received an image. Analyze it carefully:
1. BILL/RECEIPT: If it's a bill, receipt, or invoice:
   - Extract each line item with description and amount
   - Use logExpense tool for EACH item separately
   - Common items: groceries (sabzi, dal, chawal), utilities (bijli, gas), supplies, transport
   - Look for total amount, itemized list, shop name, date

2. KHATA/LEDGER (Pending Collections): If it's a handwritten khata or collection record:
   - Extract customer names and amounts they owe
   - Use createReceivable tool for each pending amount
   - Look for names with amounts, dates, "baaki" or pending markers

3. COMBINED: If both expenses and receivables are visible, process both

4. UNCLEAR: If you can't read the image clearly, ask user to send a clearer photo

Always confirm what you extracted and logged after processing.` : "";

  return new Agent({
    model: gateway("openai/gpt-4o"),
    system: `You are Saarathi, a WhatsApp business assistant for Indian micro-business owners.
You speak natural Hinglish (Hindi + English mix). Be warm, helpful, concise.

CURRENT BUSINESS STATE:
- Business: ${context.owner?.businessName}
- Owner: ${context.owner?.name}
- Cash in hand: ₹${context.owner?.currentCash.toLocaleString("en-IN")}
- Staff: ${context.staff.map(s => `${s.name} (₹${s.salaryAmount}/month${s.advanceBalance ? `, advance: ₹${s.advanceBalance}` : ""})`).join(", ") || "None"}
- Customers: ${context.customers.map(c => c.name).join(", ") || "None"}
- Pending receivables: ${context.receivables.map(r => `${r.customer?.name}: ₹${r.amount - (r.amountPaid || 0)}`).join(", ") || "None"}
- This month: Income ₹${context.monthlyIncome.toLocaleString("en-IN")}, Expenses ₹${context.monthlyExpenses.toLocaleString("en-IN")}

RULES:
1. If the user mentions staff/customers WITHOUT salary/amount info, ASK for the missing details
2. Don't assume salaries - always ask
3. Be conversational - you're chatting on WhatsApp
4. Format numbers in Indian style (₹25,000)
5. Use tools to execute actions, respond conversationally after${imageInstructions}`,

    tools: {
      logExpense: tool({
        description: "Log a business expense",
        inputSchema: z.object({
          description: z.string().describe("What was purchased"),
          amount: z.number().describe("Amount in rupees"),
          category: z.string().optional().describe("Category like supplies, utilities, transport, rent"),
        }),
        execute: async ({ description, amount, category }) => {
          await db.transaction.create({
            data: { ownerId, type: "expense", category: category || "other", amount, description, source: "whatsapp" },
          });
          const owner = await db.owner.update({
            where: { id: ownerId },
            data: { currentCash: { decrement: amount } },
          });
          return { success: true, description, amount, newCash: owner.currentCash };
        },
      }),

      recordIncome: tool({
        description: "Record payment received",
        inputSchema: z.object({
          amount: z.number().describe("Amount received"),
          customerName: z.string().optional().describe("Customer name if known"),
        }),
        execute: async ({ amount, customerName }) => {
          let customer = null;
          if (customerName) {
            customer = await db.customer.findFirst({
              where: { ownerId, name: { contains: customerName, mode: "insensitive" } },
            });
            if (!customer) {
              customer = await db.customer.create({ data: { ownerId, name: customerName } });
            }
          }
          await db.transaction.create({
            data: { ownerId, type: "income", amount, description: `Payment from ${customerName || "customer"}`, customerId: customer?.id, source: "whatsapp" },
          });
          const owner = await db.owner.update({
            where: { id: ownerId },
            data: { currentCash: { increment: amount } },
          });
          return { success: true, amount, from: customerName || "Unknown", newCash: owner.currentCash };
        },
      }),

      addStaff: tool({
        description: "Add a new staff member to payroll",
        inputSchema: z.object({
          name: z.string().describe("Staff member's name"),
          salaryAmount: z.number().describe("Salary amount"),
          salaryType: z.enum(["monthly", "daily", "weekly"]).optional().describe("Payment frequency"),
        }),
        execute: async ({ name, salaryAmount, salaryType }) => {
          const staff = await db.staff.create({
            data: { ownerId, name, salaryAmount, salaryType: salaryType || "monthly", paymentDay: 1 },
          });
          return { success: true, name: staff.name, salary: salaryAmount, type: salaryType || "monthly" };
        },
      }),

      paySalary: tool({
        description: "Pay salary to a staff member",
        inputSchema: z.object({
          staffName: z.string().describe("Staff member's name"),
          amount: z.number().optional().describe("Amount to pay (uses default salary if not specified)"),
        }),
        execute: async ({ staffName, amount }) => {
          const staff = await db.staff.findFirst({
            where: { ownerId, name: { contains: staffName, mode: "insensitive" }, isActive: true },
          });
          if (!staff) return { success: false, error: `Staff "${staffName}" not found` };
          const salaryAmount = amount || staff.salaryAmount;
          await db.transaction.create({
            data: { ownerId, type: "salary", category: "salary", amount: salaryAmount, description: `Salary to ${staff.name}`, staffId: staff.id, source: "whatsapp" },
          });
          const owner = await db.owner.update({
            where: { id: ownerId },
            data: { currentCash: { decrement: salaryAmount } },
          });
          return { success: true, staffName: staff.name, amount: salaryAmount, newCash: owner.currentCash };
        },
      }),

      giveAdvance: tool({
        description: "Give advance payment to staff",
        inputSchema: z.object({
          staffName: z.string().describe("Staff member's name"),
          amount: z.number().describe("Advance amount"),
        }),
        execute: async ({ staffName, amount }) => {
          const staff = await db.staff.findFirst({
            where: { ownerId, name: { contains: staffName, mode: "insensitive" }, isActive: true },
          });
          if (!staff) return { success: false, error: `Staff "${staffName}" not found` };
          await db.staff.update({ where: { id: staff.id }, data: { advanceBalance: { increment: amount } } });
          await db.transaction.create({
            data: { ownerId, type: "advance", category: "salary", amount, description: `Advance to ${staff.name}`, staffId: staff.id, source: "whatsapp" },
          });
          const owner = await db.owner.update({
            where: { id: ownerId },
            data: { currentCash: { decrement: amount } },
          });
          return { success: true, staffName: staff.name, amount, newCash: owner.currentCash };
        },
      }),

      addCustomer: tool({
        description: "Add a new customer",
        inputSchema: z.object({
          name: z.string().describe("Customer's name"),
          phone: z.string().optional().describe("Phone number"),
        }),
        execute: async ({ name, phone }) => {
          const customer = await db.customer.create({ data: { ownerId, name, phone } });
          return { success: true, name: customer.name, phone: customer.phone };
        },
      }),

      createReceivable: tool({
        description: "Create a credit sale / pending payment from customer",
        inputSchema: z.object({
          customerName: z.string().describe("Customer's name"),
          amount: z.number().describe("Amount owed"),
          notes: z.string().optional().describe("Notes about the sale"),
        }),
        execute: async ({ customerName, amount, notes }) => {
          let customer = await db.customer.findFirst({
            where: { ownerId, name: { contains: customerName, mode: "insensitive" } },
          });
          if (!customer) {
            customer = await db.customer.create({ data: { ownerId, name: customerName } });
          }
          await db.receivable.create({
            data: { ownerId, customerId: customer.id, amount, notes, status: "pending" },
          });
          return { success: true, customer: customer.name, amount };
        },
      }),

      getBusinessStatus: tool({
        description: "Get current business status summary",
        inputSchema: z.object({}),
        execute: async () => {
          const owner = await db.owner.findUnique({
            where: { id: ownerId },
            include: { staff: { where: { isActive: true } }, customers: true },
          });
          const receivables = await db.receivable.findMany({
            where: { ownerId, status: { in: ["pending", "partial"] } },
          });
          const totalPending = receivables.reduce((sum, r) => sum + (r.amount - (r.amountPaid || 0)), 0);
          return {
            businessName: owner?.businessName,
            cash: owner?.currentCash,
            pendingReceivables: totalPending,
            staffCount: owner?.staff.length || 0,
            customerCount: owner?.customers.length || 0,
          };
        },
      }),

      getStaffList: tool({
        description: "Get list of all staff with their salary info",
        inputSchema: z.object({}),
        execute: async () => {
          const staff = await db.staff.findMany({ where: { ownerId, isActive: true } });
          return {
            staff: staff.map(s => ({
              name: s.name,
              salary: s.salaryAmount,
              type: s.salaryType,
              advance: s.advanceBalance || 0,
            })),
            totalPayroll: staff.reduce((sum, s) => sum + s.salaryAmount, 0),
          };
        },
      }),

      getPendingPayments: tool({
        description: "Get list of pending payments from customers",
        inputSchema: z.object({}),
        execute: async () => {
          const receivables = await db.receivable.findMany({
            where: { ownerId, status: { in: ["pending", "partial"] } },
            include: { customer: true },
          });
          const now = new Date();
          return {
            pending: receivables.map(r => ({
              customer: r.customer?.name || "Unknown",
              amount: r.amount - (r.amountPaid || 0),
              daysOld: Math.floor((now.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
            })),
            total: receivables.reduce((sum, r) => sum + (r.amount - (r.amountPaid || 0)), 0),
          };
        },
      }),

      getCashForecast: tool({
        description: "Get cash flow projections/forecast for the next 7, 14, or 30 days",
        inputSchema: z.object({
          days: z.number().optional().describe("Number of days to forecast (7, 14, or 30). Default is 7."),
        }),
        execute: async ({ days = 7 }) => {
          const projections = await db.projection.findMany({
            where: { ownerId },
            orderBy: { date: "asc" },
            take: days,
          });

          if (projections.length === 0) {
            // Generate basic projections if none exist
            const owner = await db.owner.findUnique({ where: { id: ownerId } });
            const staff = await db.staff.findMany({ where: { ownerId, isActive: true } });
            const monthlyPayroll = staff.reduce((sum, s) => sum + s.salaryAmount, 0);
            const dailyBurn = monthlyPayroll / 30;

            const forecast = [];
            let cash = owner?.currentCash || 0;
            const today = new Date();

            for (let i = 1; i <= days; i++) {
              const date = new Date(today);
              date.setDate(date.getDate() + i);
              cash -= dailyBurn;
              const flags: string[] = [];
              if (cash < 0) flags.push("negative");
              if (cash < monthlyPayroll * 0.5) flags.push("low_cash");
              if (date.getDate() === 1) flags.push("salary_due");

              forecast.push({
                date: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
                projectedCash: Math.round(cash),
                confidence: "medium",
                flags,
              });
            }

            return {
              forecast,
              summary: {
                startingCash: owner?.currentCash || 0,
                endingCash: Math.round(cash),
                dailyBurn: Math.round(dailyBurn),
                daysOfRunway: owner?.currentCash ? Math.floor((owner.currentCash) / dailyBurn) : 0,
                problemDays: forecast.filter(f => f.flags.length > 0).map(f => f.date),
              },
            };
          }

          return {
            forecast: projections.map(p => ({
              date: p.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
              projectedCash: p.projectedCash,
              expectedIn: p.expectedIn,
              expectedOut: p.expectedOut,
              confidence: p.confidence,
              flags: p.flags,
            })),
            summary: {
              startingCash: projections[0]?.projectedCash || 0,
              endingCash: projections[projections.length - 1]?.projectedCash || 0,
              problemDays: projections.filter(p => p.flags.length > 0).map(p =>
                p.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
              ),
            },
          };
        },
      }),

      getAlerts: tool({
        description: "Get business alerts and warnings (cash crunch, salary due, overdue payments, expense spikes)",
        inputSchema: z.object({}),
        execute: async () => {
          const alerts = await db.alert.findMany({
            where: { ownerId, status: { in: ["pending", "sent"] } },
            orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
          });

          // Also generate real-time alerts based on current state
          const owner = await db.owner.findUnique({ where: { id: ownerId } });
          const staff = await db.staff.findMany({ where: { ownerId, isActive: true } });
          const receivables = await db.receivable.findMany({
            where: { ownerId, status: { in: ["pending", "partial"] } },
            include: { customer: true },
          });

          const liveAlerts: Array<{ type: string; severity: string; title: string; message: string }> = [];
          const monthlyPayroll = staff.reduce((sum, s) => sum + s.salaryAmount, 0);
          const currentCash = owner?.currentCash || 0;

          // Cash crunch alert
          if (currentCash < monthlyPayroll) {
            liveAlerts.push({
              type: "cash_crunch",
              severity: currentCash < monthlyPayroll * 0.5 ? "critical" : "warning",
              title: "Cash Running Low",
              message: `Cash ₹${currentCash.toLocaleString("en-IN")} is less than monthly payroll ₹${monthlyPayroll.toLocaleString("en-IN")}`,
            });
          }

          // Salary due alert (near month end)
          const today = new Date();
          if (today.getDate() >= 25) {
            liveAlerts.push({
              type: "salary_due",
              severity: "warning",
              title: "Salary Due Soon",
              message: `Month end approaching. Total payroll: ₹${monthlyPayroll.toLocaleString("en-IN")}`,
            });
          }

          // Overdue payments alert
          const now = new Date();
          const overduePayments = receivables.filter(r => {
            const daysOld = Math.floor((now.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
            return daysOld > 7;
          });

          if (overduePayments.length > 0) {
            const overdueTotal = overduePayments.reduce((sum, r) => sum + (r.amount - (r.amountPaid || 0)), 0);
            liveAlerts.push({
              type: "overdue_payment",
              severity: "warning",
              title: "Overdue Payments",
              message: `${overduePayments.length} payments overdue, total ₹${overdueTotal.toLocaleString("en-IN")}`,
            });
          }

          // Staff advance alerts
          const staffWithHighAdvance = staff.filter(s => s.advanceBalance && s.advanceBalance > s.salaryAmount * 0.5);
          if (staffWithHighAdvance.length > 0) {
            liveAlerts.push({
              type: "high_advance",
              severity: "info",
              title: "High Staff Advances",
              message: `${staffWithHighAdvance.map(s => s.name).join(", ")} have advances > 50% of salary`,
            });
          }

          return {
            savedAlerts: alerts.map(a => ({
              type: a.type,
              severity: a.severity,
              title: a.title,
              message: a.message,
              status: a.status,
            })),
            liveAlerts,
            summary: {
              critical: liveAlerts.filter(a => a.severity === "critical").length,
              warning: liveAlerts.filter(a => a.severity === "warning").length,
              info: liveAlerts.filter(a => a.severity === "info").length,
            },
          };
        },
      }),

      dismissAlert: tool({
        description: "Dismiss or acknowledge an alert",
        inputSchema: z.object({
          alertType: z.string().describe("Type of alert to dismiss: cash_crunch, salary_due, overdue_payment, high_advance"),
        }),
        execute: async ({ alertType }) => {
          const updated = await db.alert.updateMany({
            where: { ownerId, type: alertType, status: "pending" },
            data: { status: "dismissed" },
          });
          return { success: true, dismissed: updated.count, type: alertType };
        },
      }),
    },

    stopWhen: stepCountIs(10),
  });
}

// Main agent function
export async function runAgent(phone: string, message: string, imageBase64?: string): Promise<string> {
  let owner = await db.owner.findUnique({ where: { phone } });

  if (!owner) {
    owner = await db.owner.create({
      data: { phone, onboardingStep: "START" },
    });
    return `🙏 Namaste! Main Saarathi hoon - aapka business assistant.

Pehle mujhe aapke baare mein batao:
👤 Aapka naam kya hai?`;
  }

  if (owner.onboardingStep !== "COMPLETE") {
    return await handleOnboarding(owner, message);
  }

  try {
    const context = await getBusinessContext(owner.id);
    const agent = createBusinessAgent(owner.id, context, !!imageBase64);

    // Build prompt - multimodal if image provided
    let prompt: string | Array<{ type: "text"; text: string } | { type: "image"; image: string }>;

    if (imageBase64) {
      const imagePrompt = message || "Is photo mein kya hai? Bill hai toh expense log karo, khata hai toh pending payment create karo.";
      prompt = [
        { type: "text", text: imagePrompt },
        { type: "image", image: imageBase64 },
      ];
    } else {
      prompt = message;
    }

    const result = await agent.generate({ prompt });

    console.log("Agent steps:", result.steps.length);
    console.log("Agent response:", result.text?.substring(0, 100));

    return result.text || "Kuch samajh nahi aaya. Phir se batao?";
  } catch (error) {
    console.error("Agent error:", error);
    return "Sorry, kuch problem ho gayi. Please try again.";
  }
}

// Onboarding handler
async function handleOnboarding(
  owner: { id: string; phone: string; onboardingStep: string; name: string | null; businessName: string | null },
  message: string
): Promise<string> {
  const step = owner.onboardingStep;

  if (step === "START") {
    await db.owner.update({
      where: { id: owner.id },
      data: { name: message.trim(), onboardingStep: "GET_BUSINESS" },
    });
    return `Nice to meet you, ${message.trim()}! 🤝\n\nAapka business ka naam kya hai?`;
  }

  if (step === "GET_BUSINESS") {
    await db.owner.update({
      where: { id: owner.id },
      data: { businessName: message.trim(), onboardingStep: "GET_CASH" },
    });
    return `${message.trim()} - great! 💼\n\nAaj aapke paas kitna cash hai? (Example: 25000)`;
  }

  if (step === "GET_CASH") {
    const cash = parseInt(message.replace(/[^\d]/g, "")) || 0;
    await db.owner.update({
      where: { id: owner.id },
      data: { currentCash: cash, onboardingStep: "COMPLETE" },
    });
    return `✅ Setup done! Cash: ₹${cash.toLocaleString("en-IN")}

Bolo, kya help chahiye?`;
  }

  return "Kuch gadbad ho gayi. 'Hi' bol ke phir se shuru karo.";
}
