'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, HelpCircle, PencilLine, XCircle } from 'lucide-react';

const DialogContext = createContext({});

export const useDialog = () => useContext(DialogContext);

let nextId = 0;

export default function DialogProvider({ children }) {
  const [dialogs, setDialogs] = useState([]);

  const addDialog = (dialog) => setDialogs((prev) => [...prev, { ...dialog, id: ++nextId }]);
  const removeDialog = (id) => setDialogs((prev) => prev.filter((d) => d.id !== id));

  const showAlert = useCallback((message, title = 'Informasi') => new Promise((resolve) => {
    addDialog({ type: 'alert', title, message, resolve });
  }), []);

  const showConfirm = useCallback((message, title = 'Konfirmasi') => new Promise((resolve) => {
    addDialog({ type: 'confirm', title, message, resolve });
  }), []);

  const showPrompt = useCallback((message, title = 'Masukkan Data', defaultValue = '') => new Promise((resolve) => {
    addDialog({ type: 'prompt', title, message, resolve, promptValue: defaultValue });
  }), []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (dialogs.length === 0 || e.key !== 'Escape') return;
      const top = dialogs[dialogs.length - 1];
      top.resolve(top.type === 'prompt' ? null : false);
      removeDialog(top.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogs]);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {dialogs.map((dialog, index) => (
        <DialogItem
          key={dialog.id}
          dialog={dialog}
          isTop={index === dialogs.length - 1}
          onClose={() => removeDialog(dialog.id)}
        />
      ))}
    </DialogContext.Provider>
  );
}

// Nada ikon mengikuti judul yang dipakai halaman: "Sukses"/"Berhasil" hijau,
// "Error"/"Gagal" merah, konfirmasi oranye, sisanya biru.
function toneOf(dialog) {
  if (dialog.type === 'confirm') return { Icon: HelpCircle, color: 'var(--accent-600)', bg: 'var(--accent-50)' };
  if (dialog.type === 'prompt') return { Icon: PencilLine, color: 'var(--brand-600)', bg: 'var(--brand-50)' };
  const t = String(dialog.title).toLowerCase();
  if (/sukses|berhasil/.test(t)) return { Icon: CheckCircle2, color: 'var(--green-600)', bg: 'var(--green-50)' };
  if (/error|gagal|peringatan/.test(t)) return { Icon: XCircle, color: 'var(--red-600)', bg: 'var(--red-50)' };
  return { Icon: AlertCircle, color: 'var(--brand-600)', bg: 'var(--brand-50)' };
}

function DialogItem({ dialog, isTop, onClose }) {
  const [inputValue, setInputValue] = useState(dialog.promptValue || '');
  const confirmRef = useRef(null);
  const { Icon, color, bg } = toneOf(dialog);
  const destructive = dialog.type === 'confirm' && /hapus|batalkan|arsip|keluar|tolak/i.test(`${dialog.title} ${dialog.message}`);

  useEffect(() => {
    if (dialog.type !== 'prompt') confirmRef.current?.focus();
  }, [dialog.type]);

  const handleConfirm = () => {
    dialog.resolve(dialog.type === 'prompt' ? inputValue : true);
    onClose();
  };

  const handleCancel = () => {
    dialog.resolve(dialog.type === 'prompt' ? null : false);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 400, pointerEvents: isTop ? 'auto' : 'none', alignItems: 'center' }} onMouseDown={(e) => e.target === e.currentTarget && handleCancel()}>
      <div className="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby={`dlg-${dialog.id}`} style={{ borderRadius: 'var(--radius-xl)' }}>
        <div style={{ padding: '22px 22px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-full)', background: bg, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 id={`dlg-${dialog.id}`} style={{ fontSize: 17, marginBottom: 4 }}>{dialog.title}</h3>
            <p style={{ fontSize: 14.5, color: 'var(--gray-600)', lineHeight: 1.6, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
              {dialog.message}
            </p>
            {dialog.type === 'prompt' && (
              <input
                type="text"
                autoFocus
                className="form-input"
                style={{ marginTop: 14 }}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                placeholder="Ketik di sini…"
              />
            )}
          </div>
        </div>
        <div className="modal-footer">
          {dialog.type !== 'alert' && (
            <button type="button" className="btn btn-outline" onClick={handleCancel}>Batal</button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirm}
          >
            {dialog.type === 'alert' ? 'Mengerti' : dialog.type === 'prompt' ? 'Simpan' : 'Ya, lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
