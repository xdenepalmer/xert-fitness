import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AdminLoadError({ message, onRetry }) {
  return (
    <div role="alert" className="border border-xert-red/30 bg-xert-red/10 px-4 py-3 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-xert-red" />
        <p className="font-body text-sm leading-relaxed text-xert-offwhite">
          Could not load this admin data{message ? `: ${message}` : '.'}
        </p>
      </div>
      <button type="button" onClick={onRetry} title="Retry loading data" aria-label="Retry loading data"
        className="shrink-0 p-1.5 border border-xert-red/30 text-xert-red hover:border-xert-red transition-colors">
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
