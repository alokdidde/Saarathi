"use client";

import { useEffect, useState } from "react";

interface OwnerState {
  owner: {
    id: string;
    name: string | null;
    businessName: string | null;
    currentCash: number;
    onboardingStep: string;
  };
  summary: {
    cash: number;
    pendingReceivables: number;
    salaryDue: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlyProfit: number;
    staffCount: number;
    customerCount: number;
  };
  staff: Array<{
    id: string;
    name: string;
    salaryAmount: number;
    salaryType: string;
    advanceBalance: number;
    paidThisMonth: boolean;
    due: number;
  }>;
  receivables: Array<{
    id: string;
    customerName: string;
    remaining: number;
    daysOld: number;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    category: string | null;
    amount: number;
    description: string | null;
    createdAt: string;
  }>;
}

interface StateInspectorProps {
  phone: string;
  refreshTrigger: number;
}

export default function StateInspector({ phone, refreshTrigger }: StateInspectorProps) {
  const [state, setState] = useState<OwnerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(true);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/state?phone=${phone}`);
        const data = await res.json();
        if (data.success) {
          setExists(data.exists);
          setState(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch state:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [phone, refreshTrigger]);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  if (loading) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Loading state...
      </div>
    );
  }

  if (!exists || !state) {
    return (
      <div className="p-4">
        <div className="text-gray-500 text-sm mb-2">No data for this phone</div>
        <div className="text-xs text-gray-400">
          Send &quot;Hi&quot; to start onboarding
        </div>
      </div>
    );
  }

  const { owner, summary, staff, receivables, transactions } = state;

  return (
    <div className="h-full overflow-y-auto">
      {/* Owner Info */}
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">
          {owner.name || "Unknown"}
        </h3>
        <p className="text-xs text-gray-500">{owner.businessName || "No business name"}</p>
        <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
          owner.onboardingStep === "COMPLETE"
            ? "bg-green-100 text-green-700"
            : "bg-yellow-100 text-yellow-700"
        }`}>
          {owner.onboardingStep}
        </span>
      </div>

      {/* Cash Summary */}
      <div className="p-3 border-b border-gray-200 bg-emerald-50">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Cash</div>
        <div className="text-xl font-bold text-emerald-700">
          {formatCurrency(summary.cash)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Pending:</span>
            <span className="ml-1 font-medium text-orange-600">
              {formatCurrency(summary.pendingReceivables)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Salary Due:</span>
            <span className="ml-1 font-medium text-red-600">
              {formatCurrency(summary.salaryDue)}
            </span>
          </div>
        </div>
      </div>

      {/* Monthly P&L */}
      <div className="p-3 border-b border-gray-200">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">This Month</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Income:</span>
            <span className="font-medium text-green-600">+{formatCurrency(summary.monthlyIncome)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Expenses:</span>
            <span className="font-medium text-red-600">-{formatCurrency(summary.monthlyExpenses)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-100">
            <span className="text-gray-700 font-medium">Profit:</span>
            <span className={`font-bold ${summary.monthlyProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {summary.monthlyProfit >= 0 ? "+" : ""}{formatCurrency(summary.monthlyProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* Staff */}
      <div className="p-3 border-b border-gray-200">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          Staff ({summary.staffCount})
        </div>
        <div className="space-y-2">
          {staff.map((s) => (
            <div key={s.id} className="flex justify-between items-center text-xs">
              <div>
                <span className="font-medium text-gray-800">{s.name}</span>
                <span className="text-gray-400 ml-1">
                  ({s.salaryType === "daily" ? `${formatCurrency(s.salaryAmount)}/day` : `${formatCurrency(s.salaryAmount)}/mo`})
                </span>
              </div>
              <div>
                {s.paidThisMonth ? (
                  <span className="text-green-600">✓ Paid</span>
                ) : (
                  <span className="text-orange-600">{formatCurrency(s.due)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Receivables */}
      <div className="p-3 border-b border-gray-200">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          Pending ({receivables.length})
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {receivables.slice(0, 5).map((r) => (
            <div key={r.id} className="flex justify-between items-center text-xs">
              <div>
                <span className="font-medium text-gray-800">{r.customerName}</span>
                <span className={`ml-1 ${r.daysOld > 14 ? "text-red-500" : r.daysOld > 7 ? "text-orange-500" : "text-gray-400"}`}>
                  ({r.daysOld}d)
                </span>
              </div>
              <span className="font-medium text-gray-700">{formatCurrency(r.remaining)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="p-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          Recent Transactions
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {transactions.slice(0, 8).map((t) => (
            <div key={t.id} className="flex justify-between items-center text-xs py-1">
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  t.type === "income" ? "bg-green-500" :
                  t.type === "expense" ? "bg-red-500" :
                  t.type === "salary" ? "bg-blue-500" : "bg-orange-500"
                }`} />
                <span className="text-gray-600 truncate max-w-[100px]">
                  {t.description || t.category || t.type}
                </span>
              </div>
              <span className={`font-medium ${
                t.type === "income" ? "text-green-600" : "text-red-600"
              }`}>
                {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
