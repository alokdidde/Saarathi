"use client";

interface BriefPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  isLoading: boolean;
}

export default function BriefPanel({
  isOpen,
  onClose,
  title,
  content,
  isLoading,
}: BriefPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs opacity-80">Generated Report</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-emerald-700 rounded transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
              <p className="text-gray-500 text-sm">Generating {title.toLowerCase()}...</p>
            </div>
          ) : (
            <div
              className="bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed"
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
            >
              {content}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            This is a simulated scheduled message
          </p>
        </div>
      </div>
    </div>
  );
}
