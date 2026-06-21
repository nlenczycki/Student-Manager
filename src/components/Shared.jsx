import { useState } from 'react';

export function MetricCard({ label, value, accent }) {
  const colorClass = accent === 'danger' ? 'text-red-600' : accent === 'success' ? 'text-green-600' : '';
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-medium ${colorClass}`}>{value}</p>
    </div>
  );
}

export function TagPill({ label }) {
  return (
    <span className="inline-block bg-amber-50 text-amber-800 text-xs px-2 py-0.5 rounded-full mr-1">
      {label}
    </span>
  );
}

// Collapsible — a bordered section with a title and an expand/collapse
// carrot. `defaultOpen` controls initial state; each instance manages
// its own open/closed state independently (e.g. so a course list can
// have every student collapsed except one that's been expanded).
export function Collapsible({ title, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge}
        </span>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
