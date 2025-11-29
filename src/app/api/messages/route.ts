import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/messages?phone=X&since=timestamp
// Fetch messages for a phone number, optionally since a timestamp
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const phone = searchParams.get("phone");
  const since = searchParams.get("since");

  if (!phone) {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  try {
    const messages = await db.simulatorMessage.findMany({
      where: {
        phone,
        ...(since && { createdAt: { gt: new Date(since) } }),
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      messages: messages.map((m) => ({
        id: m.id,
        text: m.text,
        sender: m.sender,
        attachment: m.attachment,
        timestamp: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

// POST /api/messages
// Store a new message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, text, sender, attachment } = body;

    if (!phone || !text || !sender) {
      return NextResponse.json(
        { error: "Phone, text, and sender are required" },
        { status: 400 }
      );
    }

    const message = await db.simulatorMessage.create({
      data: {
        phone,
        text,
        sender,
        attachment: attachment || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        text: message.text,
        sender: message.sender,
        attachment: message.attachment,
        timestamp: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to store message:", error);
    return NextResponse.json(
      { error: "Failed to store message" },
      { status: 500 }
    );
  }
}

// DELETE /api/messages?phone=X
// Clear messages for a phone number
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const phone = searchParams.get("phone");

  if (!phone) {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  try {
    await db.simulatorMessage.deleteMany({
      where: { phone },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear messages:", error);
    return NextResponse.json(
      { error: "Failed to clear messages" },
      { status: 500 }
    );
  }
}
