"use client";

import { useState, useRef, useEffect } from "react";
import StateInspector from "./components/StateInspector";
import ScenarioPanel from "./components/ScenarioPanel";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  attachment?: {
    type: "photo" | "contact";
    data: string;
    name?: string;
  };
}

export default function SimulatorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [phone, setPhone] = useState("9876543210");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!messageText) setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text }),
      });

      const data = await response.json();

      if (data.success && data.response) {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: data.response,
          sender: "bot",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
        setRefreshTrigger((prev) => prev + 1);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: `Error: ${data.error || "Unknown error"}`,
          sender: "bot",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Connection error: ${error}`,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/seed", { method: "DELETE" });
      setMessages([]);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to reset:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeed = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessages([
          {
            id: Date.now().toString(),
            text: `✅ Demo data loaded!\n\nOwner: ${data.data.owner}\nPhone: ${data.data.phone}\nCash: ₹${data.data.cash.toLocaleString()}\nStaff: ${data.data.staff}\nCustomers: ${data.data.customers}\n\nTry "Status batao" to see the business status.`,
            sender: "bot",
            timestamp: new Date(),
          },
        ]);
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Failed to seed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const photoMessage: Message = {
          id: Date.now().toString(),
          text: "📷 Photo attached",
          sender: "user",
          timestamp: new Date(),
          attachment: {
            type: "photo",
            data: reader.result as string,
            name: file.name,
          },
        };
        setMessages((prev) => [...prev, photoMessage]);

        // Simulate bot response for photo
        setTimeout(() => {
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: "📷 Photo received! (OCR processing coming soon)\n\nFor now, please type the expense details:\nExample: \"Sabzi 500, daal 200\"",
            sender: "bot",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, botMessage]);
        }, 500);
      };
      reader.readAsDataURL(file);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Panel - Scenarios */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-3 bg-emerald-600 text-white">
          <h1 className="text-lg font-bold">Saarathi</h1>
          <p className="text-xs opacity-80">Test Simulator</p>
        </div>

        <div className="p-3 border-b border-gray-200">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="Phone number"
          />
        </div>

        <div className="flex-1 overflow-hidden">
          <ScenarioPanel
            onSendMessage={sendMessage}
            onReset={handleReset}
            onSeed={handleSeed}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Center Panel - Chat */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center">
              <span className="text-emerald-600 text-lg">🤖</span>
            </div>
            <div>
              <h2 className="font-semibold text-sm">Saarathi Assistant</h2>
              <p className="text-xs opacity-80">{phone}</p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="px-3 py-1 text-xs bg-emerald-700 hover:bg-emerald-800 rounded transition-colors"
          >
            Clear
          </button>
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
              <p className="text-4xl mb-2">👋</p>
              <p className="text-sm">Click &quot;Load Demo&quot; to get started</p>
              <p className="text-xs text-gray-400 mt-1">or send &quot;Hi&quot; to start fresh</p>
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
                  {msg.timestamp.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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

        {/* Input Area */}
        <div className="bg-gray-50 px-3 py-2 border-t border-gray-200">
          <div className="flex gap-2 items-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={handlePhotoUpload}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
              title="Attach photo"
            >
              📷
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:border-emerald-500"
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-emerald-500 text-white rounded-full text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - State Inspector */}
      <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">State Inspector</h3>
          <p className="text-xs text-gray-500">Real-time data view</p>
        </div>

        <div className="flex-1 overflow-hidden">
          <StateInspector phone={phone} refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </div>
  );
}
