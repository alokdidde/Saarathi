import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET - Fetch messages for a customer
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get("id");
    const since = request.nextUrl.searchParams.get("since");

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const messages = await db.customerMessage.findMany({
      where: {
        customerId,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      messages: messages.map((m) => ({
        id: m.id,
        text: m.text,
        sender: m.sender,
        timestamp: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Customer messages GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages", details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Send a message to customer (collection reminder)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, text, sender = "business" } = body;

    if (!customerId || !text) {
      return NextResponse.json(
        { error: "Customer ID and text are required" },
        { status: 400 }
      );
    }

    const message = await db.customerMessage.create({
      data: {
        customerId,
        text,
        sender,
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        text: message.text,
        sender: message.sender,
        timestamp: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Customer messages POST error:", error);
    return NextResponse.json(
      { error: "Failed to send message", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Clear messages for a customer
export async function DELETE(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get("id");

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    await db.customerMessage.deleteMany({
      where: { customerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Customer messages DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete messages", details: String(error) },
      { status: 500 }
    );
  }
}
