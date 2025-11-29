"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Message {
  id: string;
  text: string;
  sender: "business" | "customer";
  timestamp: Date | string;
}

export default function CustomerChatPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("id") || "customer1";
  const customerName = searchParams.get("name") || "TechPark Office";

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = useCallback(async (since?: string) => {
    try {
      const url = since
        ? `/api/customer-messages?id=${customerId}&since=${since}`
        : `/api/customer-messages?id=${customerId}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = data.messages.filter(
            (m: Message) => !existingIds.has(m.id)
          );
          return [...prev, ...newMessages];
        });

        const lastMsg = data.messages[data.messages.length - 1];
        lastFetchRef.current = lastMsg.timestamp;
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  }, [customerId]);

  useEffect(() => {
    setMessages([]);
    lastFetchRef.current = null;
    fetchMessages();

    pollingRef.current = setInterval(() => {
      fetchMessages(lastFetchRef.current || undefined);
    }, 1000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [customerId, fetchMessages]);

  const formatTime = (timestamp: Date | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center p-4 md:p-8">
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
          <div className="w-full h-full bg-white rounded-[2rem] md:rounded-[2.25rem] overflow-hidden flex flex-col">
            {/* Chat Header */}
            <div className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center">
                <span className="text-emerald-600 text-lg">P</span>
              </div>
              <div>
                <h2 className="font-semibold text-sm">Priya's Tiffin Service</h2>
                <p className="text-xs opacity-80">Business Account</p>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-3"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e5e7eb' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  <p className="text-4xl mb-2">P</p>
                  <p className="text-sm">No messages yet...</p>
                  <p className="text-xs mt-2 text-gray-400">
                    Viewing as: {customerName}
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      msg.sender === "customer"
                        ? "bg-emerald-500 text-white rounded-br-none"
                        : "bg-white text-gray-800 rounded-bl-none shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
                    <div
                      className={`text-xs mt-1 ${
                        msg.sender === "customer" ? "text-emerald-100" : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 shrink-0">
              <p className="text-xs text-gray-500 text-center">
                Customer View: {customerName}
              </p>
            </div>
          </div>

          {/* Home Indicator */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
    </div>
  );
}
