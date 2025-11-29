"use client";

import { useRef, useEffect } from "react";

export interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date | string;
  attachment?: {
    type: "photo" | "contact";
    data: string;
    name?: string;
  };
}

interface ChatViewProps {
  messages: Message[];
  phone: string;
  isLoading?: boolean;
  showInput?: boolean;
  onSendMessage?: (text: string) => void;
  onClear?: () => void;
}

export default function ChatView({
  messages,
  phone,
  isLoading = false,
  showInput = false,
  onSendMessage,
  onClear,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (input && input.value.trim() && onSendMessage) {
      onSendMessage(input.value.trim());
      input.value = "";
    }
  };

  const formatTime = (timestamp: Date | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Chat Header */}
      <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center">
            <span className="text-emerald-600 text-lg">S</span>
          </div>
          <div>
            <h2 className="font-semibold text-sm">Saarathi Assistant</h2>
            <p className="text-xs opacity-80">{phone}</p>
          </div>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="px-3 py-1 text-xs bg-emerald-700 hover:bg-emerald-800 rounded transition-colors"
          >
            Clear
          </button>
        )}
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
            <p className="text-4xl mb-2">S</p>
            <p className="text-sm">Waiting for messages...</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 ${
                msg.sender === "user"
                  ? "bg-emerald-500 text-white rounded-br-none"
                  : "bg-white text-gray-800 rounded-bl-none shadow-sm"
              }`}
            >
              {msg.attachment?.type === "photo" && (
                <div className="mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.attachment.data}
                    alt="Uploaded"
                    className="max-w-[200px] rounded"
                  />
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
              <div
                className={`text-xs mt-1 ${
                  msg.sender === "user" ? "text-emerald-100" : "text-gray-400"
                }`}
              >
                {formatTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area (optional) */}
      {showInput && onSendMessage && (
        <form onSubmit={handleSubmit} className="bg-gray-50 px-3 py-2 border-t border-gray-200 shrink-0">
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:border-emerald-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-emerald-500 text-white rounded-full text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
