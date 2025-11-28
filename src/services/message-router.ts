import { db } from "@/lib/db";
import { detectIntent, type Intent } from "@/lib/ai";
import { handleOnboarding } from "./onboarding";
import { handleTransaction } from "./transaction";
import { handleStaff } from "./staff";
import { handleStatusQuery, handleProjectionQuery, handlePendingQuery, handleStaffQuery, handleProfitQuery } from "./queries";

export interface MessageContext {
  phone: string;
  message: string;
  ownerId?: string;
  onboardingStep?: string;
}

export interface MessageResponse {
  text: string;
  ownerId?: string;
}

// Main message router - determines intent and routes to appropriate handler
export async function routeMessage(ctx: MessageContext): Promise<MessageResponse> {
  const { phone, message } = ctx;

  // Get or create owner
  let owner = await db.owner.findUnique({
    where: { phone },
    include: {
      staff: { where: { isActive: true } },
      customers: true,
    },
  });

  // New user - start onboarding
  if (!owner) {
    owner = await db.owner.create({
      data: {
        phone,
        onboardingStep: "START",
      },
      include: {
        staff: { where: { isActive: true } },
        customers: true,
      },
    });
  }

  // If still onboarding, route to onboarding handler
  if (owner.onboardingStep !== "COMPLETE") {
    return handleOnboarding({
      owner: owner as Parameters<typeof handleOnboarding>[0]["owner"],
      message,
    });
  }

  // Detect intent for completed onboarding users
  const staffNames = owner.staff.map((s) => s.name);
  const customerNames = owner.customers.map((c) => c.name);

  const intent = await detectIntent(message, {
    onboardingStep: owner.onboardingStep,
    staffNames,
    customerNames,
  });

  // Route based on intent
  return routeByIntent(intent, owner, message);
}

async function routeByIntent(
  intent: Intent,
  owner: NonNullable<Awaited<ReturnType<typeof db.owner.findUnique>>> & {
    staff: Awaited<ReturnType<typeof db.staff.findMany>>;
    customers: Awaited<ReturnType<typeof db.customer.findMany>>;
  },
  message: string
): Promise<MessageResponse> {
  switch (intent.intent) {
    case "log_expense":
      return handleTransaction({
        owner: owner as Parameters<typeof handleTransaction>[0]["owner"],
        message,
        type: "expense",
      });

    case "log_income":
    case "payment_received":
      return handleTransaction({
        owner: owner as Parameters<typeof handleTransaction>[0]["owner"],
        message,
        type: "income",
      });

    case "salary_paid":
      return handleStaff({
        owner: owner as Parameters<typeof handleStaff>[0]["owner"],
        message,
        action: "salary_paid",
      });

    case "advance_given":
      return handleStaff({
        owner: owner as Parameters<typeof handleStaff>[0]["owner"],
        message,
        action: "advance",
      });

    case "add_staff":
      return handleStaff({
        owner: owner as Parameters<typeof handleStaff>[0]["owner"],
        message,
        action: "add",
      });

    case "status_query":
      return handleStatusQuery(owner as Parameters<typeof handleStatusQuery>[0]);

    case "projection_query":
      return handleProjectionQuery(owner as Parameters<typeof handleProjectionQuery>[0]);

    case "pending_query":
      return handlePendingQuery(owner as Parameters<typeof handlePendingQuery>[0]);

    case "staff_query":
      return handleStaffQuery(owner as Parameters<typeof handleStaffQuery>[0]);

    case "profit_query":
      return handleProfitQuery(owner as Parameters<typeof handleProfitQuery>[0]);

    case "greeting":
      return {
        text: `🙏 Namaste ${owner.name || ""}!\n\nMain Saarathi hoon - aapka business assistant.\n\n"Status batao" - business status\n"Next week" - 7-day forecast\n"Pending" - pending payments\n\nYa simply expenses/income log karo!`,
        ownerId: owner.id,
      };

    case "help":
      return {
        text: `📚 *HELP*\n\n*Log Transactions:*\n• "Sabzi 2000, gas 900"\n• "Sharma se 5000 mila"\n• "Ramu salary done"\n\n*Check Status:*\n• "Status batao"\n• "Next week kaisa hai"\n• "Profit kitna hua"\n• "Kaun kitna dena hai"\n\n*Staff:*\n• "Staff add karo"\n• "Ramu ko 2000 advance"`,
        ownerId: owner.id,
      };

    default:
      // Try to interpret as expense if contains numbers
      if (/\d/.test(message)) {
        return handleTransaction({
          owner: owner as Parameters<typeof handleTransaction>[0]["owner"],
          message,
          type: "expense",
        });
      }

      return {
        text: `🤔 Samajh nahi aaya. Try:\n• "Sabzi 2000" - expense log\n• "Status batao" - business status\n• "Help" - all commands`,
        ownerId: owner.id,
      };
  }
}
