"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ChatView, { Message } from "../components/ChatView";

function ChatPageContent() {
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") || "9876543210";

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchRef = useRef<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMessages = useCallback(async (since?: string) => {
    try {
      const url = since
        ? `/api/messages?phone=${phone}&since=${since}`
        : `/api/messages?phone=${phone}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && data.messages.length > 0) {
        setMessages((prev) => {
          // Avoid duplicates by checking IDs
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = data.messages.filter(
            (m: Message) => !existingIds.has(m.id)
          );
          return [...prev, ...newMessages];
        });

        // Update last fetch timestamp
        const lastMsg = data.messages[data.messages.length - 1];
        lastFetchRef.current = lastMsg.timestamp;
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  }, [phone]);

  // Initial fetch and polling setup
  useEffect(() => {
    // Reset messages when phone changes
    setMessages([]);
    lastFetchRef.current = null;

    // Initial fetch
    fetchMessages();

    // Set up polling every 1 second
    pollingRef.current = setInterval(() => {
      fetchMessages(lastFetchRef.current || undefined);
    }, 1000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [phone, fetchMessages]);

  const handleSendMessage = async (text: string) => {
    setIsLoading(true);

    try {
      // Optimistically add user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        text,
        sender: "user",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Send to chat API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text }),
      });

      const data = await res.json();

      if (data.success) {
        // Force immediate fetch to get both messages with correct IDs
        await fetchMessages(lastFetchRef.current || undefined);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black flex items-center justify-center p-4 md:p-8">
      {/* Phone Frame Container - clips the side buttons */}
      <div className="overflow-hidden p-1">
        <div
          className="relative bg-gray-950 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl ring-1 ring-gray-700"
          style={{
            maxWidth: '400px',
            width: 'calc(100vw - 48px)',
            height: 'min(92vh, 820px)',
            padding: '10px',
          }}
        >
          {/* Side Buttons */}
          <div className="absolute -left-0.5 top-24 w-1 h-8 bg-gray-700 rounded-l-sm" />
          <div className="absolute -left-0.5 top-36 w-1 h-12 bg-gray-700 rounded-l-sm" />
          <div className="absolute -left-0.5 top-52 w-1 h-12 bg-gray-700 rounded-l-sm" />
          <div className="absolute -right-0.5 top-32 w-1 h-16 bg-gray-700 rounded-r-sm" />

          {/* Screen */}
          <div className="w-full h-full bg-white rounded-[2rem] md:rounded-[2.25rem] overflow-hidden">
            <ChatView
              messages={messages}
              phone={phone}
              isLoading={isLoading}
              showInput={true}
              onSendMessage={handleSendMessage}
            />
          </div>

          {/* Home Indicator */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <ChatPageContent />
    </Suspense>
  );
}
