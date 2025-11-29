"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import StateInspector from "../components/StateInspector";
import ScenarioPanel from "../components/ScenarioPanel";

export default function ControlPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPhone = searchParams.get("phone") || "9876543210";

  const [phone, setPhone] = useState(initialPhone);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [chatUrl, setChatUrl] = useState("");

  // Update URL when phone changes
  useEffect(() => {
    if (phone !== initialPhone) {
      router.push(`/simulator/control?phone=${phone}`);
    }
  }, [phone, initialPhone, router]);

  // Generate chat URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const baseUrl = window.location.origin;
      setChatUrl(`${baseUrl}/simulator/chat?phone=${phone}`);
    }
  }, [phone]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: messageText }),
      });

      const data = await response.json();

      if (data.success) {
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      // Clear database data
      await fetch("/api/seed", { method: "DELETE" });
      // Clear simulator messages
      await fetch(`/api/messages?phone=${phone}`, { method: "DELETE" });
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to reset:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    setIsLoading(true);
    try {
      await fetch(`/api/messages?phone=${phone}`, { method: "DELETE" });
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeed = async () => {
    setIsLoading(true);
    try {
      // Clear old messages first
      await fetch(`/api/messages?phone=${phone}`, { method: "DELETE" });

      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // Add a welcome message to the chat
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            text: `Demo data loaded!\n\nOwner: ${data.data.owner}\nPhone: ${data.data.phone}\nCash: Rs.${data.data.cash.toLocaleString()}\nStaff: ${data.data.staff}\nCustomers: ${data.data.customers}\n\nTry "Status batao" to see the business status.`,
            sender: "bot",
          }),
        });
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Failed to seed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenBrief = async (type: "morning" | "evening" | "weekly" | "health" | "profit") => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type }),
      });

      const data = await response.json();

      if (data.success) {
        // Send the brief content as a bot message to the chat
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            text: data.content,
            sender: "bot",
          }),
        });
      } else {
        // Send error as bot message
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            text: `Error generating report: ${data.error}`,
            sender: "bot",
          }),
        });
      }
    } catch (error) {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          text: `Error: ${error}`,
          sender: "bot",
        }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(chatUrl);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Panel - Scenarios */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-3 bg-emerald-600 text-white">
          <h1 className="text-lg font-bold">Saarathi</h1>
          <p className="text-xs opacity-80">Control Panel</p>
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
            onOpenBrief={handleOpenBrief}
            onClearChat={handleClearChat}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Center Panel - Chat URL Display */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">
            Chat View URL
          </h2>
          <p className="text-sm text-gray-500 mb-4 text-center">
            Open this URL on another device to see the chat view
          </p>

          <div className="bg-gray-100 rounded-lg p-3 mb-4">
            <code className="text-sm text-gray-700 break-all">{chatUrl}</code>
          </div>

          <button
            onClick={copyUrl}
            className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            Copy URL
          </button>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Instructions:</h3>
            <ol className="text-sm text-gray-600 space-y-2">
              <li>1. Copy the URL above</li>
              <li>2. Open it on your phone or another device</li>
              <li>3. Use the controls on the left to send messages</li>
              <li>4. Watch the chat update on the other device</li>
            </ol>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Note:</strong> Both devices must be on the same network for localhost URLs.
              For cross-network access, use your machine&apos;s IP address instead of localhost.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - State Inspector */}
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col">
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
