import { db, type Owner } from "@/lib/db";
import { parseStaffInput } from "@/lib/ai";
import { formatCurrency } from "@/lib/whatsapp";

interface OnboardingContext {
  owner: Owner & {
    staff: Array<{ id: string; name: string; salaryAmount: number }>;
    customers: Array<{ id: string; name: string }>;
  };
  message: string;
}

interface OnboardingResponse {
  text: string;
  ownerId: string;
}

// Onboarding flow steps:
// START -> NAME -> CASH -> STAFF -> PENDING -> COMPLETE

export async function handleOnboarding(ctx: OnboardingContext): Promise<OnboardingResponse> {
  const { owner, message } = ctx;
  const step = owner.onboardingStep;

  switch (step) {
    case "START":
      return handleStart(owner, message);

    case "NAME":
      return handleName(owner, message);

    case "CASH":
      return handleCash(owner, message);

    case "STAFF":
      return handleStaffStep(owner, message);

    case "PENDING":
      return handlePending(owner, message);

    default:
      // Shouldn't reach here, but reset to complete
      await db.owner.update({
        where: { id: owner.id },
        data: { onboardingStep: "COMPLETE" },
      });
      return {
        text: "✅ Setup complete! Ab aap transactions log kar sakte ho.",
        ownerId: owner.id,
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleStart(owner: Owner, _message: string): Promise<OnboardingResponse> {
  // First message - ask for name and business
  await db.owner.update({
    where: { id: owner.id },
    data: { onboardingStep: "NAME" },
  });

  return {
    text: `🙏 *Namaste! Main Saarathi hoon*

Aapka business assistant jo aapko batayega:
• Business kaisa chal raha hai
• Next week cash kaisa rahega
• Salary day pe paisa bachega ya nahi

*Shuru karte hain!*

Apna naam aur business batao:
(Example: "Priya, Tiffin Service")`,
    ownerId: owner.id,
  };
}

async function handleName(owner: Owner, message: string): Promise<OnboardingResponse> {
  // Parse name and business from message
  // Expected format: "Name, Business" or just "Name"
  const parts = message.split(/[,،]/).map((p) => p.trim());
  const name = parts[0] || message.trim();
  const businessName = parts[1] || null;

  await db.owner.update({
    where: { id: owner.id },
    data: {
      name,
      businessName,
      onboardingStep: "CASH",
    },
  });

  const greeting = businessName
    ? `${name}, ${businessName}`
    : name;

  return {
    text: `👋 Welcome ${greeting}!

💰 *Abhi kitna cash hai business mein?*

(Roughly batao - example: "25000" ya "25k")`,
    ownerId: owner.id,
  };
}

async function handleCash(owner: Owner, message: string): Promise<OnboardingResponse> {
  // Parse cash amount
  const cleanMessage = message.toLowerCase().replace(/[₹,\s]/g, "");
  let amount = 0;

  // Handle "k" suffix (25k = 25000)
  if (cleanMessage.includes("k")) {
    const num = parseFloat(cleanMessage.replace("k", ""));
    amount = num * 1000;
  } else if (cleanMessage.includes("l") || cleanMessage.includes("lakh")) {
    const num = parseFloat(cleanMessage.replace(/l(akh)?/, ""));
    amount = num * 100000;
  } else {
    amount = parseFloat(cleanMessage) || 0;
  }

  if (amount <= 0) {
    return {
      text: `🤔 Amount samajh nahi aaya. Number batao:\n\nExample: "25000" ya "25k"`,
      ownerId: owner.id,
    };
  }

  await db.owner.update({
    where: { id: owner.id },
    data: {
      currentCash: amount,
      onboardingStep: "STAFF",
    },
  });

  return {
    text: `✅ Cash: ${formatCurrency(amount)}

👥 *Staff hai? Kitne log, kitni salary?*

Format: Name Amount Type Date
Example:
"Ramu 10000 monthly 1st
Sita 8000 monthly 1st
Bunty 500 daily"

Ya "skip" if no staff`,
    ownerId: owner.id,
  };
}

async function handleStaffStep(owner: Owner, message: string): Promise<OnboardingResponse> {
  const lowerMessage = message.toLowerCase().trim();

  // Skip option
  if (lowerMessage === "skip" || lowerMessage === "no" || lowerMessage === "nahi") {
    await db.owner.update({
      where: { id: owner.id },
      data: { onboardingStep: "PENDING" },
    });

    return {
      text: `✅ No staff added.

📋 *Customers se kuch pending hai?*

Format: Name Amount
Example:
"TechPark 12000
Sharma 5000
Kumar 8000"

Ya "skip" if nothing pending`,
      ownerId: owner.id,
    };
  }

  // Parse staff from message
  const parsed = await parseStaffInput(message);

  if (parsed.staff.length === 0) {
    // Try simple parsing: "Name Amount" per line
    const lines = message.split(/[\n,]/).filter((l) => l.trim());
    for (const line of lines) {
      const match = line.match(/([a-zA-Z]+)\s+(\d+)/i);
      if (match) {
        const name = match[1].trim();
        const amount = parseInt(match[2]);
        const isDaily = /daily/i.test(line);
        const dayMatch = line.match(/(\d+)(st|nd|rd|th)?/);
        const paymentDay = !isDaily && dayMatch ? parseInt(dayMatch[1]) : null;

        await db.staff.create({
          data: {
            ownerId: owner.id,
            name,
            salaryAmount: amount,
            salaryType: isDaily ? "daily" : "monthly",
            paymentDay: paymentDay && paymentDay <= 31 ? paymentDay : 1,
          },
        });
      }
    }
  } else {
    // Use AI-parsed staff
    for (const staff of parsed.staff) {
      await db.staff.create({
        data: {
          ownerId: owner.id,
          name: staff.name,
          salaryAmount: staff.salaryAmount,
          salaryType: staff.salaryType,
          paymentDay: staff.paymentDay || 1,
        },
      });
    }
  }

  // Get updated staff list
  const staffList = await db.staff.findMany({
    where: { ownerId: owner.id, isActive: true },
  });

  if (staffList.length === 0) {
    return {
      text: `🤔 Staff details samajh nahi aaye.\n\nFormat: "Ramu 10000 monthly 1st"\nYa "skip" to continue`,
      ownerId: owner.id,
    };
  }

  const totalMonthly = staffList
    .filter((s) => s.salaryType === "monthly")
    .reduce((sum, s) => sum + s.salaryAmount, 0);

  const staffSummary = staffList
    .map((s) => `👤 ${s.name} - ${formatCurrency(s.salaryAmount)}/${s.salaryType === "daily" ? "day" : "month"}`)
    .join("\n");

  await db.owner.update({
    where: { id: owner.id },
    data: { onboardingStep: "PENDING" },
  });

  return {
    text: `✅ *Staff saved:*

${staffSummary}

Monthly total: ${formatCurrency(totalMonthly)}

📋 *Customers se kuch pending hai?*

Format: Name Amount
Example:
"TechPark 12000
Sharma 5000"

Ya "skip" if nothing pending`,
    ownerId: owner.id,
  };
}

async function handlePending(owner: Owner, message: string): Promise<OnboardingResponse> {
  const lowerMessage = message.toLowerCase().trim();

  // Skip option
  if (lowerMessage === "skip" || lowerMessage === "no" || lowerMessage === "nahi") {
    return completeOnboarding(owner);
  }

  // Parse pending payments: "Name Amount" per line
  const lines = message.split(/[\n,]/).filter((l) => l.trim());
  let totalPending = 0;
  const addedCustomers: string[] = [];

  for (const line of lines) {
    const match = line.match(/([a-zA-Z\s]+?)\s+(\d+)/i);
    if (match) {
      const name = match[1].trim();
      const amount = parseInt(match[2]);

      // Create customer and receivable
      const customer = await db.customer.create({
        data: {
          ownerId: owner.id,
          name,
        },
      });

      await db.receivable.create({
        data: {
          ownerId: owner.id,
          customerId: customer.id,
          amount,
          status: "pending",
        },
      });

      totalPending += amount;
      addedCustomers.push(`• ${name}: ${formatCurrency(amount)}`);
    }
  }

  if (addedCustomers.length === 0) {
    return {
      text: `🤔 Details samajh nahi aaye.\n\nFormat: "TechPark 12000"\nYa "skip" to continue`,
      ownerId: owner.id,
    };
  }

  // Complete onboarding with summary
  return completeOnboarding(owner, totalPending, addedCustomers);
}

async function completeOnboarding(
  owner: Owner,
  totalPending = 0,
  pendingList: string[] = []
): Promise<OnboardingResponse> {
  await db.owner.update({
    where: { id: owner.id },
    data: { onboardingStep: "COMPLETE" },
  });

  // Get final summary
  const updatedOwner = await db.owner.findUnique({
    where: { id: owner.id },
    include: {
      staff: { where: { isActive: true } },
      receivables: { where: { status: "pending" } },
    },
  });

  const totalStaffSalary = updatedOwner?.staff
    .filter((s) => s.salaryType === "monthly")
    .reduce((sum, s) => sum + s.salaryAmount, 0) || 0;

  let summary = `🎉 *Setup Complete!*

📊 *Your Business:*
• Cash: ${formatCurrency(updatedOwner?.currentCash || 0)}`;

  if (totalPending > 0) {
    summary += `\n• Pending: ${formatCurrency(totalPending)} (${pendingList.length} customers)`;
  }

  if (updatedOwner?.staff && updatedOwner.staff.length > 0) {
    summary += `\n• Staff: ${updatedOwner.staff.length} (${formatCurrency(totalStaffSalary)}/month)`;
  }

  summary += `

*Kal subah 9 baje pehla business update milega!* ☀️

Ab aap:
• "Sabzi 2000" - expense log
• "Sharma se 5000 mila" - income log
• "Status batao" - full status
• "Next week" - 7-day forecast`;

  return {
    text: summary,
    ownerId: owner.id,
  };
}
