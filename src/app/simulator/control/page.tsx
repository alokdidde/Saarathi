"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import StateInspector from "../components/StateInspector";
import ScenarioPanel from "../components/ScenarioPanel";

// Demo customers for collection reminders (outside component to avoid recreation)
const DEMO_CUSTOMERS = [
  { id: "techpark", name: "TechPark Office", amount: 12000, days: 18 },
  { id: "kumar", name: "Kumar Enterprises", amount: 5000, days: 12 },
  { id: "sharma", name: "Sharma Ji", amount: 3500, days: 8 },
];

function ControlPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPhone = searchParams.get("phone") || "9876543210";

  const [phone, setPhone] = useState(initialPhone);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [chatUrl, setChatUrl] = useState("");
  const [customerUrl, setCustomerUrl] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("techpark");
  const [copyFeedback, setCopyFeedback] = useState("");

  // Update URL when phone changes
  useEffect(() => {
    if (phone !== initialPhone) {
      router.push(`/simulator/control?phone=${phone}`);
    }
  }, [phone, initialPhone, router]);

  // Generate URLs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const baseUrl = window.location.origin;
      setChatUrl(`${baseUrl}/simulator/chat?phone=${phone}`);
      const customer = DEMO_CUSTOMERS.find(c => c.id === selectedCustomer) || DEMO_CUSTOMERS[0];
      setCustomerUrl(`${baseUrl}/simulator/customer?id=${selectedCustomer}&name=${encodeURIComponent(customer.name)}`);
    }
  }, [phone, selectedCustomer]);

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

  const sendImage = async (imageUrl: string, caption?: string) => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      // Fetch the image and convert to base64
      const imageResponse = await fetch(imageUrl);
      const blob = await imageResponse.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          message: caption || "",
          image: base64
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Failed to send image:", error);
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

  const copyUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(`${label} copied!`);
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopyFeedback(`${label} copied!`);
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const sendCollectionReminder = async () => {
    setIsLoading(true);
    const customer = DEMO_CUSTOMERS.find(c => c.id === selectedCustomer) || DEMO_CUSTOMERS[0];

    const message = `Saarathi → ${customer.name}:

🙏 Namaste!

Priya's Tiffin Service ki taraf se
yaad dila rahe hain — ₹${customer.amount.toLocaleString("en-IN")} baaki hai
(${customer.days} din se pending).

💳 UPI: priya@okicici

✅ Payment ke baad screenshot yahan
   share kar dijiye — hum update kar lenge!

Dhanyavaad 🙏`;

    try {
      await fetch("/api/customer-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer,
          text: message,
          sender: "business",
        }),
      });
    } catch (error) {
      console.error("Failed to send collection reminder:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearCustomerChat = async () => {
    try {
      await fetch(`/api/customer-messages?id=${selectedCustomer}`, { method: "DELETE" });
    } catch (error) {
      console.error("Failed to clear customer chat:", error);
    }
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
            onSendImage={sendImage}
            onReset={handleReset}
            onSeed={handleSeed}
            onOpenBrief={handleOpenBrief}
            onClearChat={handleClearChat}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Center Panel - URLs Display */}
      <div className="flex-1 flex flex-col items-center justify-start bg-gray-50 p-6 overflow-y-auto">
        {/* Owner Chat URL */}
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">👩‍🍳</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Owner Chat</h2>
              <p className="text-xs text-gray-500">Priya&apos;s view (business owner)</p>
            </div>
          </div>

          <div className="bg-gray-100 rounded-lg p-2 mb-3">
            <code className="text-xs text-gray-700 break-all">{chatUrl}</code>
          </div>

          <button
            onClick={() => copyUrl(chatUrl, "Owner URL")}
            className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            Copy Owner URL
          </button>
        </div>

        {/* Customer Chat URL */}
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🏢</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Customer Chat</h2>
              <p className="text-xs text-gray-500">Customer receiving collection reminders</p>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Select Customer
            </label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              {DEMO_CUSTOMERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - ₹{c.amount.toLocaleString("en-IN")} ({c.days} days)
                </option>
              ))}
            </select>
          </div>

          <div className="bg-gray-100 rounded-lg p-2 mb-3">
            <code className="text-xs text-gray-700 break-all">{customerUrl}</code>
          </div>

          <button
            onClick={() => copyUrl(customerUrl, "Customer URL")}
            className="w-full py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium mb-3"
          >
            Copy Customer URL
          </button>

          <button
            onClick={sendCollectionReminder}
            disabled={isLoading}
            className="w-full py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium disabled:opacity-50"
          >
            📤 Send Collection Reminder
          </button>

          <button
            onClick={clearCustomerChat}
            className="w-full mt-2 py-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            Clear customer chat
          </button>
        </div>

        {/* Copy Feedback */}
        {copyFeedback && (
          <div className="max-w-md w-full bg-green-100 text-green-800 rounded-lg p-2 mb-4 text-center text-sm font-medium">
            ✓ {copyFeedback}
          </div>
        )}

        {/* Instructions */}
        <div className="max-w-md w-full bg-blue-50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">How it works:</h3>
          <ol className="text-xs text-blue-700 space-y-1">
            <li>1. Open Owner URL on one device (Priya&apos;s phone)</li>
            <li>2. Open Customer URL on another device</li>
            <li>3. Click &quot;Send Collection Reminder&quot; to demo the message</li>
            <li>4. Customer sees the payment reminder in real-time</li>
          </ol>
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

export default function ControlPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-gray-100" />}>
      <ControlPageContent />
    </Suspense>
  );
}
