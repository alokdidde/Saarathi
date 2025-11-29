"use client";

interface ScenarioPanelProps {
  onSendMessage: (message: string) => void;
  onReset: () => Promise<void>;
  onSeed: () => Promise<void>;
  onOpenBrief: (type: "morning" | "evening" | "weekly" | "health" | "profit") => void;
  isLoading: boolean;
}

export default function ScenarioPanel({
  onSendMessage,
  onReset,
  onSeed,
  onOpenBrief,
  isLoading,
}: ScenarioPanelProps) {
  const briefs = [
    { label: "Morning Brief", icon: "☀️", type: "morning" as const, description: "Daily snapshot" },
    { label: "Evening Wrap", icon: "🌙", type: "evening" as const, description: "Day summary" },
    { label: "Weekly Summary", icon: "📊", type: "weekly" as const, description: "Week review" },
    { label: "Health Score", icon: "💚", type: "health" as const, description: "Business health" },
    { label: "Profit & Loss", icon: "📈", type: "profit" as const, description: "P&L report" },
  ];

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
      action: () => onSendMessage("kya scene hai"),
    },
    {
      label: "Forecast",
      icon: "📅",
      description: "Cash flow projection",
      action: () => onSendMessage("next week kaisa lagta hai"),
      highlight: true,
    },
    {
      label: "Alerts",
      icon: "🚨",
      description: "Warnings & issues",
      action: () => onSendMessage("koi dikkat hai kya"),
      highlight: true,
    },
    {
      label: "Pending",
      icon: "💰",
      description: "Who owes money",
      action: () => onSendMessage("kisne paise dene hai"),
    },
    {
      label: "Staff",
      icon: "👥",
      description: "Staff salary",
      action: () => onSendMessage("staff ka kya haal hai"),
    },
    {
      label: "Expense",
      icon: "🧾",
      description: "Log expense",
      action: () => onSendMessage("aaj sabzi 500 aur auto 100"),
    },
    {
      label: "Income",
      icon: "💵",
      description: "Payment received",
      action: () => onSendMessage("sharma ne 5000 diye"),
    },
    {
      label: "Salary",
      icon: "💸",
      description: "Pay salary",
      action: () => onSendMessage("ramu ki salary de di"),
    },
    {
      label: "Advance",
      icon: "🏧",
      description: "Give advance",
      action: () => onSendMessage("sita ko 1000 advance diya"),
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900 text-sm">Test Simulator</h3>
        <p className="text-xs text-gray-500">Quick actions for testing</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Reports Section */}
        <div className="p-2 border-b border-gray-200">
          <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Scheduled Reports
          </div>
          <div className="space-y-1 mt-1">
            {briefs.map((brief) => (
              <button
                key={brief.type}
                onClick={() => onOpenBrief(brief.type)}
                disabled={isLoading}
                className="w-full text-left px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{brief.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-blue-800 group-hover:text-blue-900">
                      {brief.label}
                    </div>
                    <div className="text-xs text-blue-600">
                      {brief.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Scenarios */}
        <div className="p-2">
          <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Chat Scenarios
          </div>
          <div className="space-y-1 mt-1">
            {scenarios.map((scenario, idx) => (
              <button
                key={idx}
                onClick={scenario.action}
                disabled={isLoading}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed group ${
                  scenario.highlight
                    ? "bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                    : "hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{scenario.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium group-hover:text-emerald-700 ${
                      scenario.highlight ? "text-emerald-800" : "text-gray-800"
                    }`}>
                      {scenario.label}
                    </div>
                    <div className={`text-xs truncate ${
                      scenario.highlight ? "text-emerald-600" : "text-gray-500"
                    }`}>
                      {scenario.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
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
