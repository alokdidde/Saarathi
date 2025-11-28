import { NextRequest, NextResponse } from "next/server";
import { routeMessage } from "@/services/message-router";
import { storeSimulatorMessage, getSimulatorResponses } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Phone and message are required" },
        { status: 400 }
      );
    }

    // Store incoming message for simulator history
    storeSimulatorMessage({
      from: phone,
      text: message,
      timestamp: new Date(),
      type: "text",
    });

    // Route the message and get response
    const response = await routeMessage({
      phone,
      message,
    });

    return NextResponse.json({
      success: true,
      response: response.text,
      ownerId: response.ownerId,
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
