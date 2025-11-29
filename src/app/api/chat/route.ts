import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { storeSimulatorMessage, getSimulatorResponses } from "@/lib/whatsapp";

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

    // Store incoming message for simulator history
    storeSimulatorMessage({
      from: phone,
      text: message || "[Photo]",
      timestamp: new Date(),
      type: image ? "image" : "text",
    });

    // Run the AI agent to process the message (with optional image)
    const response = await runAgent(phone, message || "", image);

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
