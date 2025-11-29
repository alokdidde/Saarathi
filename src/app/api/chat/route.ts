import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { storeSimulatorMessage, getSimulatorResponses } from "@/lib/whatsapp";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, message, image } = body;

    if (!phone || (!message && !image)) {
      return NextResponse.json(
        { error: "Phone and message/image are required" },
        { status: 400 }
      );
    }

    // Store incoming message for simulator history (legacy)
    storeSimulatorMessage({
      from: phone,
      text: message || "",
      timestamp: new Date(),
      type: image ? "image" : "text",
    });

    // Store user message in database for multi-device sync
    await db.simulatorMessage.create({
      data: {
        phone,
        text: message || "",
        sender: "user",
        attachment: image ? { type: "photo", data: image } : undefined,
      },
    });

    // Run the AI agent to process the message (with optional image)
    const response = await runAgent(phone, message || "", image);

    // Store bot response in database for multi-device sync
    await db.simulatorMessage.create({
      data: {
        phone,
        text: response,
        sender: "bot",
      },
    });

    return NextResponse.json({
      success: true,
      response,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process message", details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve pending responses (for polling)
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json(
      { error: "Phone parameter is required" },
      { status: 400 }
    );
  }

  const responses = getSimulatorResponses(phone);

  return NextResponse.json({
    responses,
  });
}
