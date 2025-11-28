import { generateObject, generateText } from "ai";
import { z } from "zod";

// Model via Vercel AI Gateway (AI_GATEWAY_API_KEY env var is auto-detected)
const model = "openai/gpt-4o-mini";

// Intent schema for message classification
export const IntentSchema = z.object({
  intent: z.enum([
    "onboarding_response",
    "log_expense",
    "log_income",
    "payment_received",
    "salary_paid",
    "advance_given",
    "add_staff",
    "status_query",
    "projection_query",
    "pending_query",
    "staff_query",
    "profit_query",
    "reminder_request",
    "greeting",
    "help",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    amounts: z.array(z.object({
      value: z.number(),
      label: z.string().optional(),
    })).optional(),
    names: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    dates: z.array(z.string()).optional(),
  }).optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

// Detect intent from user message
export async function detectIntent(
  message: string,
  context: {
    onboardingStep?: string;
    staffNames?: string[];
    customerNames?: string[];
  }
): Promise<Intent> {
  const systemPrompt = `You are an intent classifier for a WhatsApp business assistant used by Indian micro-business owners.
The user may write in Hindi, Hinglish, or English. Classify the intent and extract entities.

Context:
- Onboarding step: ${context.onboardingStep || "COMPLETE"}
- Known staff names: ${context.staffNames?.join(", ") || "none"}
- Known customer names: ${context.customerNames?.join(", ") || "none"}

Common patterns:
- "Sabzi 2000, gas 900" = log_expense (multiple items)
- "Sharma se 5000 mila" / "5000 received from X" = payment_received
- "Ramu salary done" / "Ramu ki salary de di" = salary_paid
- "Ramu ko 2000 advance" = advance_given
- "Status batao" / "Kaisa chal raha hai" = status_query
- "Next week kaisa hai" / "Projection dikhao" = projection_query
- "Kaun kitna dena hai" / "Pending batao" = pending_query
- "Staff ko kitna dena hai" = staff_query
- "Profit kitna hua" = profit_query
- Adding staff: "3 staff hain" or "Ramu 10000 monthly 1st"

If onboarding is not COMPLETE, classify as onboarding_response.`;

  try {
    const { object } = await generateObject({
      model,
      schema: IntentSchema,
      system: systemPrompt,
      prompt: message,
    });
    return object;
  } catch (error) {
    console.error("Intent detection error:", error);
    return {
      intent: "unknown",
      confidence: 0,
    };
  }
}

// Transaction parsing schema
export const TransactionParseSchema = z.object({
  transactions: z.array(z.object({
    type: z.enum(["income", "expense", "salary", "advance"]),
    amount: z.number(),
    description: z.string(),
    category: z.string().optional(),
    personName: z.string().optional(),
  })),
});

export type ParsedTransactions = z.infer<typeof TransactionParseSchema>;

// Parse transaction details from natural language
export async function parseTransactions(
  message: string,
  context: {
    staffNames?: string[];
    customerNames?: string[];
  }
): Promise<ParsedTransactions> {
  const systemPrompt = `Parse financial transactions from the user's message. The user is an Indian micro-business owner.
Extract each transaction with amount, description, category, and person name if mentioned.

Categories: supplies, utilities, transport, salary, rent, equipment, other
Known staff: ${context.staffNames?.join(", ") || "none"}
Known customers: ${context.customerNames?.join(", ") || "none"}

Examples:
- "Sabzi 2000, gas 900" → [{type: "expense", amount: 2000, description: "Sabzi", category: "supplies"}, {type: "expense", amount: 900, description: "Gas", category: "utilities"}]
- "Sharma se 8000 mila" → [{type: "income", amount: 8000, description: "Payment from Sharma", personName: "Sharma"}]
- "Ramu salary done 10000" → [{type: "salary", amount: 10000, description: "Salary to Ramu", personName: "Ramu", category: "salary"}]`;

  try {
    const { object } = await generateObject({
      model,
      schema: TransactionParseSchema,
      system: systemPrompt,
      prompt: message,
    });
    return object;
  } catch (error) {
    console.error("Transaction parsing error:", error);
    return { transactions: [] };
  }
}

// Staff parsing schema
export const StaffParseSchema = z.object({
  staff: z.array(z.object({
    name: z.string(),
    salaryAmount: z.number(),
    salaryType: z.enum(["monthly", "daily", "weekly"]),
    paymentDay: z.number().optional(),
  })),
});

export type ParsedStaff = z.infer<typeof StaffParseSchema>;

// Parse staff details from natural language
export async function parseStaffInput(message: string): Promise<ParsedStaff> {
  const systemPrompt = `Parse staff information from the user's message. Extract name, salary amount, type (monthly/daily/weekly), and payment day if mentioned.

Examples:
- "Ramu 10000 monthly 1st" → [{name: "Ramu", salaryAmount: 10000, salaryType: "monthly", paymentDay: 1}]
- "Sita 8000 1st" → [{name: "Sita", salaryAmount: 8000, salaryType: "monthly", paymentDay: 1}]
- "Bunty 500 daily" → [{name: "Bunty", salaryAmount: 500, salaryType: "daily"}]
- "3 staff hain" → [] (no specific details yet)`;

  try {
    const { object } = await generateObject({
      model,
      schema: StaffParseSchema,
      system: systemPrompt,
      prompt: message,
    });
    return object;
  } catch (error) {
    console.error("Staff parsing error:", error);
    return { staff: [] };
  }
}

// Generate natural response
export async function generateResponse(
  prompt: string,
  context?: string
): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      system: `You are Saarathi, a friendly WhatsApp business assistant for Indian micro-business owners.
Respond in a mix of Hindi and English (Hinglish) that feels natural.
Keep responses concise and formatted for WhatsApp (use emojis sparingly, line breaks for readability).
${context || ""}`,
      prompt,
    });
    return text;
  } catch (error) {
    console.error("Response generation error:", error);
    return "Sorry, kuch problem ho gayi. Please try again.";
  }
}
