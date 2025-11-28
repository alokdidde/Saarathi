import { db, type Owner, type Staff } from "@/lib/db";
import { parseStaffInput } from "@/lib/ai";
import { formatCurrency } from "@/lib/whatsapp";

interface StaffContext {
  owner: Owner & {
    staff: Staff[];
  };
  message: string;
  action: "add" | "salary_paid" | "advance";
}

interface StaffResponse {
  text: string;
  ownerId: string;
}

export async function handleStaff(ctx: StaffContext): Promise<StaffResponse> {
  const { owner, message, action } = ctx;

  switch (action) {
    case "add":
      return handleAddStaff(owner, message);
    case "salary_paid":
      return handleSalaryPaid(owner, message);
    case "advance":
      return handleAdvance(owner, message);
    default:
      return {
        text: "Staff action not recognized",
        ownerId: owner.id,
      };
  }
}

async function handleAddStaff(owner: Owner, message: string): Promise<StaffResponse> {
  // Parse staff from message
  const parsed = await parseStaffInput(message);

  if (parsed.staff.length === 0) {
    // Try simple parsing
    const match = message.match(/([a-zA-Z]+)\s+(\d+)/i);
    if (match) {
      const name = match[1].trim();
      const amount = parseInt(match[2]);
      const isDaily = /daily/i.test(message);
      const dayMatch = message.match(/(\d+)(st|nd|rd|th)/);
      const paymentDay = dayMatch ? parseInt(dayMatch[1]) : 1;

      await db.staff.create({
        data: {
          ownerId: owner.id,
          name,
          salaryAmount: amount,
          salaryType: isDaily ? "daily" : "monthly",
          paymentDay: isDaily ? null : paymentDay,
        },
      });

      return {
        text: `✅ Staff added:\n\n👤 ${name} - ${formatCurrency(amount)}/${isDaily ? "day" : "month"}`,
        ownerId: owner.id,
      };
    }

    return {
      text: `🤔 Staff details samajh nahi aaye.\n\nFormat: "Ramu 10000 monthly 1st"`,
      ownerId: owner.id,
    };
  }

  // Add all parsed staff
  const addedStaff: string[] = [];
  for (const staff of parsed.staff) {
    await db.staff.create({
      data: {
        ownerId: owner.id,
        name: staff.name,
        salaryAmount: staff.salaryAmount,
        salaryType: staff.salaryType,
        paymentDay: staff.salaryType === "daily" ? null : (staff.paymentDay || 1),
      },
    });
    addedStaff.push(
      `👤 ${staff.name} - ${formatCurrency(staff.salaryAmount)}/${staff.salaryType === "daily" ? "day" : "month"}`
    );
  }

  return {
    text: `✅ Staff added:\n\n${addedStaff.join("\n")}`,
    ownerId: owner.id,
  };
}

async function handleSalaryPaid(owner: Owner & { staff: Staff[] }, message: string): Promise<StaffResponse> {
  // Find staff member mentioned in message
  const staffMember = findStaffInMessage(message, owner.staff);

  if (!staffMember) {
    if (owner.staff.length === 0) {
      return {
        text: "❌ No staff registered. Use 'Add staff Ramu 10000' first.",
        ownerId: owner.id,
      };
    }

    const staffList = owner.staff.map((s) => s.name).join(", ");
    return {
      text: `🤔 Which staff? Your team: ${staffList}\n\nExample: "Ramu salary done"`,
      ownerId: owner.id,
    };
  }

  // Calculate salary after advance deduction
  const salaryDue = staffMember.salaryAmount - staffMember.advanceBalance;

  // Extract amount if specified, otherwise use full salary
  const amountMatch = message.match(/(\d+)/);
  const paidAmount = amountMatch ? parseInt(amountMatch[0]) : salaryDue;

  // Check if owner has enough cash
  if (owner.currentCash < paidAmount) {
    return {
      text: `⚠️ Cash kam hai!\n\nSalary: ${formatCurrency(paidAmount)}\nCash available: ${formatCurrency(owner.currentCash)}\nShortfall: ${formatCurrency(paidAmount - owner.currentCash)}`,
      ownerId: owner.id,
    };
  }

  // Create salary transaction
  await db.transaction.create({
    data: {
      ownerId: owner.id,
      staffId: staffMember.id,
      type: "salary",
      category: "salary",
      amount: paidAmount,
      description: `Salary to ${staffMember.name}`,
    },
  });

  // Update owner cash
  const newCash = owner.currentCash - paidAmount;
  await db.owner.update({
    where: { id: owner.id },
    data: { currentCash: newCash },
  });

  // Reset advance balance
  await db.staff.update({
    where: { id: staffMember.id },
    data: { advanceBalance: 0 },
  });

  // Get remaining salaries
  const remainingSalaries = await getRemainingMonthlySalaries(owner.id, staffMember.id);

  let response = `✅ *Salary Paid*\n\n👤 ${staffMember.name}: ${formatCurrency(paidAmount)}`;

  if (staffMember.advanceBalance > 0) {
    response += `\n(After ${formatCurrency(staffMember.advanceBalance)} advance deduction)`;
  }

  response += `\n\n💰 Cash: ${formatCurrency(newCash)}`;

  if (remainingSalaries.total > 0) {
    response += `\n\n📋 *Remaining this month:*\n${remainingSalaries.list.join("\n")}\nTotal: ${formatCurrency(remainingSalaries.total)}`;
  }

  return {
    text: response,
    ownerId: owner.id,
  };
}

async function handleAdvance(owner: Owner & { staff: Staff[] }, message: string): Promise<StaffResponse> {
  // Find staff member and amount
  const staffMember = findStaffInMessage(message, owner.staff);

  if (!staffMember) {
    if (owner.staff.length === 0) {
      return {
        text: "❌ No staff registered. Use 'Add staff Ramu 10000' first.",
        ownerId: owner.id,
      };
    }

    const staffList = owner.staff.map((s) => s.name).join(", ");
    return {
      text: `🤔 Which staff? Your team: ${staffList}\n\nExample: "Ramu ko 2000 advance"`,
      ownerId: owner.id,
    };
  }

  // Extract amount
  const amountMatch = message.match(/(\d+)/);
  if (!amountMatch) {
    return {
      text: `🤔 Kitna advance? Example: "Ramu ko 2000 advance"`,
      ownerId: owner.id,
    };
  }

  const amount = parseInt(amountMatch[0]);

  // Check if owner has enough cash
  if (owner.currentCash < amount) {
    return {
      text: `⚠️ Cash kam hai!\n\nAdvance: ${formatCurrency(amount)}\nCash available: ${formatCurrency(owner.currentCash)}`,
      ownerId: owner.id,
    };
  }

  // Create advance transaction
  await db.transaction.create({
    data: {
      ownerId: owner.id,
      staffId: staffMember.id,
      type: "advance",
      category: "salary",
      amount,
      description: `Advance to ${staffMember.name}`,
    },
  });

  // Update staff advance balance
  const newAdvance = staffMember.advanceBalance + amount;
  await db.staff.update({
    where: { id: staffMember.id },
    data: { advanceBalance: newAdvance },
  });

  // Update owner cash
  const newCash = owner.currentCash - amount;
  await db.owner.update({
    where: { id: owner.id },
    data: { currentCash: newCash },
  });

  const nextSalary = staffMember.salaryAmount - newAdvance;

  return {
    text: `✅ *Advance Logged*\n\n👤 ${staffMember.name}:\n• Advance: ${formatCurrency(amount)}\n• Total advance: ${formatCurrency(newAdvance)}\n• Next salary: ${formatCurrency(nextSalary)}\n\n💰 Cash: ${formatCurrency(newCash)}`,
    ownerId: owner.id,
  };
}

// Helper: Find staff member mentioned in message
function findStaffInMessage(message: string, staff: Staff[]): Staff | undefined {
  const lowerMessage = message.toLowerCase();

  for (const s of staff) {
    if (lowerMessage.includes(s.name.toLowerCase())) {
      return s;
    }
  }

  return undefined;
}

// Helper: Get remaining monthly salaries
async function getRemainingMonthlySalaries(
  ownerId: string,
  excludeStaffId?: string
): Promise<{ total: number; list: string[] }> {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

  // Get all monthly staff
  const staff = await db.staff.findMany({
    where: {
      ownerId,
      isActive: true,
      salaryType: "monthly",
      ...(excludeStaffId ? { id: { not: excludeStaffId } } : {}),
    },
  });

  // Check which salaries haven't been paid this month
  const unpaidStaff: Array<{ name: string; amount: number }> = [];

  for (const s of staff) {
    const paidThisMonth = await db.transaction.findFirst({
      where: {
        ownerId,
        staffId: s.id,
        type: "salary",
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    if (!paidThisMonth) {
      unpaidStaff.push({
        name: s.name,
        amount: s.salaryAmount - s.advanceBalance,
      });
    }
  }

  return {
    total: unpaidStaff.reduce((sum, s) => sum + s.amount, 0),
    list: unpaidStaff.map(
      (s) => `• ${s.name}: ${formatCurrency(s.amount)}`
    ),
  };
}
