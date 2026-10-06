import React, { useEffect } from 'react';
import { Flame, AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'flame' | 'warning' | 'success' | 'danger';
  text: string;
  subtext?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const getStyles = () => {
    switch (toast.type) {
      case 'warning':
        return {
          border: 'border-amber-500/50 bg-[#16130b]',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
          titleColor: 'text-amber-300'
        };
      case 'danger':
        return {
          border: 'border-red-500/50 bg-[#170c0c]',
          icon: <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />,
          titleColor: 'text-red-300'
        };
      case 'success':
        return {
          border: 'border-emerald-500/50 bg-[#0c1710]',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
          titleColor: 'text-emerald-300'
        };
      case 'flame':
      default:
        return {
          border: 'border-[#ff4d00]/50 bg-[#1a0e08]',
          icon: <Flame className="w-5 h-5 text-[#ff4d00] shrink-0 fire-pop" />,
          titleColor: 'text-[#ff7a3d]'
        };
    }
  };

  const style = getStyles();

  return (
    <div
      id={`toast-${toast.id}`}
      className={`glass-strong toast-in pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl ${style.border}`}
    >
      <div className="pt-0.5">{style.icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold uppercase tracking-wider ${style.titleColor}`}>
          {toast.text}
        </p>
        {toast.subtext && (
          <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
            {toast.subtext}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
        aria-label="Close notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
