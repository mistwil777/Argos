import { useState, useCallback } from 'react';
import type { ToastProps } from '../components/ui/Toast';

type AddToast = (message: string, type?: ToastProps['type'], duration?: number) => string;

export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const addToast: AddToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36);
    const newToast: ToastProps = {
      id,
      message,
      type,
      duration,
      onClose: (toastId: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      },
    };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<ToastProps>) => {
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, ...updates } : toast
      )
    );
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, updateToast, removeToast };
}
