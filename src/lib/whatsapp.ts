// WhatsApp messaging abstraction layer
// Supports both simulator mode and real WhatsApp Business API

export interface Message {
  from: string; // phone number
  text: string;
  timestamp: Date;
  type: "text" | "image" | "voice";
  mediaUrl?: string;
}

export interface SendMessageOptions {
  to: string;
  text: string;
}

// Message store for simulator mode (in-memory)
const simulatorMessages: Map<string, Message[]> = new Map();
const pendingResponses: Map<string, string[]> = new Map();

// Check if we're in simulator mode
function isSimulatorMode(): boolean {
  return !process.env.WHATSAPP_TOKEN || process.env.USE_SIMULATOR === "true";
}

// Send a message to a phone number
export async function sendMessage(options: SendMessageOptions): Promise<boolean> {
  const { to, text } = options;

  if (isSimulatorMode()) {
    // Store message for simulator to retrieve
    const messages = pendingResponses.get(to) || [];
    messages.push(text);
    pendingResponses.set(to, messages);
    console.log(`[Simulator] Message to ${to}: ${text.substring(0, 100)}...`);
    return true;
  }

  // Real WhatsApp Business API
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("WhatsApp API error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return false;
  }
}

// Get pending responses for simulator
export function getSimulatorResponses(phone: string): string[] {
  const messages = pendingResponses.get(phone) || [];
  pendingResponses.delete(phone); // Clear after retrieval
  return messages;
}

// Store incoming message in simulator
export function storeSimulatorMessage(message: Message): void {
  const messages = simulatorMessages.get(message.from) || [];
  messages.push(message);
  simulatorMessages.set(message.from, messages);
}

// Get message history for simulator
export function getSimulatorHistory(phone: string): Message[] {
  return simulatorMessages.get(phone) || [];
}

// Clear simulator data for a phone
export function clearSimulatorData(phone: string): void {
  simulatorMessages.delete(phone);
  pendingResponses.delete(phone);
}

// Parse incoming WhatsApp webhook payload
export function parseWebhookPayload(payload: unknown): Message | null {
  try {
    const data = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from: string;
              timestamp: string;
              type: string;
              text?: { body: string };
              image?: { id: string };
              audio?: { id: string };
            }>;
          };
        }>;
      }>;
    };

    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return null;

    return {
      from: message.from,
      text: message.text?.body || "",
      timestamp: new Date(parseInt(message.timestamp) * 1000),
      type: message.type as "text" | "image" | "voice",
      mediaUrl: message.image?.id || message.audio?.id,
    };
  } catch (error) {
    console.error("Webhook parse error:", error);
    return null;
  }
}

// Format currency for display
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// Format date for display
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Format WhatsApp message with proper line breaks
export function formatMessage(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}
