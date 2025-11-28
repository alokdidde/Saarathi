"use client";

interface ScenarioPanelProps {
  onSendMessage: (message: string) => void;
  onReset: () => Promise<void>;
  onSeed: () => Promise<void>;
  isLoading: boolean;
}

export default function ScenarioPanel({
  onSendMessage,
  onReset,
  onSeed,
  isLoading,
}: ScenarioPanelProps) {
  const scenarios = [
    {
      label: "Start Fresh",
      icon: "🆕",
      description: "Begin onboarding",
      action: () => {
        onReset().then(() => onSendMessage("Hi"));
      },
    },
    {
      label: "Load Demo",
      icon: "📦",
      description: "Priya's Tiffin",
      action: async () => {
        await onSeed();
      },
    },
    {
      label: "Status",
      icon: "📊",
      description: "Business status",
      action: () => onSendMessage("Status batao"),
    },
    {
      label: "Projection",
      icon: "📅",
      description: "7-day forecast",
      action: () => onSendMessage("Next week kaisa hai"),
    },
    {
      label: "Pending",
      icon: "💰",
      description: "Who owes money",
      action: () => onSendMessage("Kaun kitna dena hai"),
    },
    {
      label: "Staff",
      icon: "👥",
      description: "Staff salary",
      action: () => onSendMessage("Staff ko kitna dena hai"),
    },
    {
      label: "Profit",
      icon: "📈",
      description: "P&L statement",
      action: () => onSendMessage("Profit kitna hua"),
    },
    {
      label: "Expense",
      icon: "🧾",
      description: "Log expense",
      action: () => onSendMessage("Sabzi 2000, gas 900, transport 300"),
    },
    {
      label: "Income",
      icon: "💵",
      description: "Payment received",
      action: () => onSendMessage("Sharma se 5000 mila"),
    },
    {
      label: "Salary",
      icon: "💸",
      description: "Pay salary",
      action: () => onSendMessage("Ramu salary done"),
    },
    {
      label: "Advance",
      icon: "🏧",
      description: "Give advance",
      action: () => onSendMessage("Bunty ko 1000 advance"),
    },
    {
      label: "Help",
      icon: "❓",
      description: "Show commands",
      action: () => onSendMessage("Help"),
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900 text-sm">Test Scenarios</h3>
        <p className="text-xs text-gray-500">Quick actions for testing</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {scenarios.map((scenario, idx) => (
            <button
              key={idx}
              onClick={scenario.action}
              disabled={isLoading}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{scenario.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 group-hover:text-emerald-700">
                    {scenario.label}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {scenario.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onReset}
          disabled={isLoading}
          className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        >
          🗑️ Clear All Data
        </button>
      </div>
    </div>
  );
}
