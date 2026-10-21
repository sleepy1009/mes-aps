import React, { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

// Toast system: success/info auto-dismiss 4s, error/warning 8s or until dismissed.
// Usage: const toast = useToast(); toast({ kind: 'success', message: 'Saved.' });
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const show = useCallback(({ kind = 'info', message, timeout }) => {
        const id = Date.now() + Math.random();
        const t = timeout ?? (kind === 'error' || kind === 'warning' ? 8000 : 4000);
        setToasts(prev => [...prev, { id, kind, message }]);
        setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), t);
    }, []);
    const dismiss = (id) => setToasts(prev => prev.filter(x => x.id !== id));
    return (
        <ToastContext.Provider value={show}>
            {children}
            <div className="toast-container" aria-live="polite">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
                        <span className="toast-msg">{t.message}</span>
                        <button className="toast-x" onClick={(e) => { e.stopPropagation(); dismiss(t.id); }} aria-label="Dismiss">×</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
};