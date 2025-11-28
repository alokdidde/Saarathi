import { db, type Owner, type Customer, type Staff } from "@/lib/db";
import { parseTransactions } from "@/lib/ai";
import { formatCurrency } from "@/lib/whatsapp";

interface TransactionContext {
  owner: Owner & {
    staff: Staff[];
    customers: Customer[];
  };
  message: string;
  type: "income" | "expense";
}

interface TransactionResponse {
  text: string;
  ownerId: string;
}

export async function handleTransaction(ctx: TransactionContext): Promise<TransactionResponse> {
  const { owner, message, type } = ctx;

  // Parse transactions from natural language
  const parsed = await parseTransactions(message, {
    staffNames: owner.staff.map((s) => s.name),
    customerNames: owner.customers.map((c) => c.name),
  });

  // If AI parsing failed, try simple pattern matching
  if (parsed.transactions.length === 0) {
    const simpleTransactions = parseSimpleTransactions(message, type);
    if (simpleTransactions.length > 0) {
      parsed.transactions.push(...simpleTransactions);
    }
  }

  if (parsed.transactions.length === 0) {
    return {
      text: `🤔 Transaction samajh nahi aaya.\n\nExamples:\n• "Sabzi 2000, gas 900"\n• "Sharma se 5000 mila"`,
      ownerId: owner.id,
    };
  }

  // Process each transaction
  const results: string[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const txn of parsed.transactions) {
    // Find or create customer if person name is mentioned and it's income
    let customerId: string | undefined;
    if (txn.personName && (txn.type === "income" || type === "income")) {
      const customer = await findOrCreateCustomer(owner.id, txn.personName);
      customerId = customer.id;

      // Update receivable if exists
      await updateReceivable(owner.id, customer.id, txn.amount);
    }

    // Create transaction
    const transactionType = txn.type || type;
    await db.transaction.create({
      data: {
        ownerId: owner.id,
        type: transactionType,
        amount: txn.amount,
        description: txn.description,
        category: txn.category || detectCategory(txn.description),
        customerId,
        source: "text",
      },
    });

    // Update cash balance
    if (transactionType === "income") {
      totalIn += txn.amount;
      results.push(`📥 ${txn.description}: ${formatCurrency(txn.amount)}`);
    } else {
      totalOut += txn.amount;
      results.push(`📤 ${txn.description}: ${formatCurrency(txn.amount)}`);
    }
  }

  // Update owner's cash
  const newCash = owner.currentCash + totalIn - totalOut;
  await db.owner.update({
    where: { id: owner.id },
    data: { currentCash: newCash },
  });

  // Build response
  let response = `✅ *Logged*\n\n${results.join("\n")}`;

  if (totalIn > 0 || totalOut > 0) {
    response += `\n\n💰 Cash: ${formatCurrency(newCash)}`;
    if (totalIn > 0 && totalOut > 0) {
      response += ` (↑${formatCurrency(totalIn)} ↓${formatCurrency(totalOut)})`;
    } else if (totalIn > 0) {
      response += ` (↑${formatCurrency(totalIn)})`;
    } else {
      response += ` (↓${formatCurrency(totalOut)})`;
    }
  }

  return {
    text: response,
    ownerId: owner.id,
  };
}

// Simple pattern matching for transactions
function parseSimpleTransactions(
  message: string,
  defaultType: "income" | "expense"
): Array<{ type: "income" | "expense"; amount: number; description: string; category?: string; personName?: string }> {
  const transactions: Array<{ type: "income" | "expense"; amount: number; description: string; category?: string; personName?: string }> = [];

  // Split by comma or newline
  const parts = message.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    // Pattern: "word amount" or "amount word"
    const match1 = part.match(/^([a-zA-Z\s]+?)\s+(\d+)$/i);
    const match2 = part.match(/^(\d+)\s+([a-zA-Z\s]+)$/i);

    if (match1) {
      transactions.push({
        type: defaultType,
        amount: parseInt(match1[2]),
        description: match1[1].trim(),
        category: detectCategory(match1[1]),
      });
    } else if (match2) {
      transactions.push({
        type: defaultType,
        amount: parseInt(match2[1]),
        description: match2[2].trim(),
        category: detectCategory(match2[2]),
      });
    }

    // Pattern: "X se Y mila" (received from)
    const incomeMatch = part.match(/(.+?)\s+se\s+(\d+)\s*(mila|received|aaya)/i);
    if (incomeMatch) {
      transactions.push({
        type: "income",
        amount: parseInt(incomeMatch[2]),
        description: `Payment from ${incomeMatch[1].trim()}`,
        personName: incomeMatch[1].trim(),
      });
    }
  }

  return transactions;
}

// Detect category from description
function detectCategory(description: string): string {
  const lower = description.toLowerCase();

  if (/sabzi|vegetable|grocery|kirana|ration/.test(lower)) return "supplies";
  if (/gas|cylinder|lpg|electricity|bijli|pani|water/.test(lower)) return "utilities";
  if (/petrol|diesel|auto|taxi|transport|delivery/.test(lower)) return "transport";
  if (/rent|kiraya/.test(lower)) return "rent";
  if (/salary|wages|payment/.test(lower)) return "salary";
  if (/phone|mobile|recharge|internet/.test(lower)) return "utilities";
  if (/repair|maintenance/.test(lower)) return "equipment";

  return "other";
}

// Find or create customer
async function findOrCreateCustomer(ownerId: string, name: string): Promise<Customer> {
  // Find existing customer (case-insensitive)
  let customer = await db.customer.findFirst({
    where: {
      ownerId,
      name: { equals: name, mode: "insensitive" },
    },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        ownerId,
        name: name.trim(),
      },
    });
  }

  return customer;
}

// Update receivable when payment is received
async function updateReceivable(
  ownerId: string,
  customerId: string,
  amount: number
): Promise<void> {
  // Find pending receivable for this customer
  const receivable = await db.receivable.findFirst({
    where: {
      ownerId,
      customerId,
      status: { in: ["pending", "partial"] },
    },
    orderBy: { createdAt: "asc" },
  });

  if (receivable) {
    const newAmountPaid = receivable.amountPaid + amount;
    const remaining = receivable.amount - newAmountPaid;

    if (remaining <= 0) {
      // Fully paid
      await db.receivable.update({
        where: { id: receivable.id },
        data: {
          amountPaid: receivable.amount,
          status: "paid",
          paidAt: new Date(),
        },
      });
    } else {
      // Partial payment
      await db.receivable.update({
        where: { id: receivable.id },
        data: {
          amountPaid: newAmountPaid,
          status: "partial",
        },
      });
    }

    // Update customer reliability score
    const daysSinceCreated = Math.floor(
      (Date.now() - receivable.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    await db.customer.update({
      where: { id: customerId },
      data: {
        avgDaysToPay: daysSinceCreated,
        reliabilityScore: daysSinceCreated <= 7 ? 80 : daysSinceCreated <= 14 ? 60 : 40,
      },
    });
  }
}
