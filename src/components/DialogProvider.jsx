'use client';
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, HelpCircle, FileText } from 'lucide-react';

const DialogContext = createContext({});

export const useDialog = () => useContext(DialogContext);

export default function DialogProvider({ children }) {
  const [dialogs, setDialogs] = useState([]);

  const addDialog = (dialog) => {
    setDialogs((prev) => [...prev, { ...dialog, id: Date.now().toString() }]);
  };

  const removeDialog = (id) => {
    setDialogs((prev) => prev.filter((d) => d.id !== id));
  };

  const showAlert = useCallback((message, title = 'Informasi') => {
    return new Promise((resolve) => {
      addDialog({ type: 'alert', title, message, resolve });
    });
  }, []);

  const showConfirm = useCallback((message, title = 'Konfirmasi') => {
    return new Promise((resolve) => {
      addDialog({ type: 'confirm', title, message, resolve });
    });
  }, []);

  const showPrompt = useCallback((message, title = 'Masukkan Data', defaultValue = '') => {
    return new Promise((resolve) => {
      addDialog({ type: 'prompt', title, message, resolve, promptValue: defaultValue });
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (dialogs.length === 0) return;
      const topDialog = dialogs[dialogs.length - 1];
      if (e.key === 'Escape') {
        topDialog.resolve(topDialog.type === 'prompt' ? null : false);
        removeDialog(topDialog.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogs]);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      <AnimatePresence>
        {dialogs.map((dialog, index) => {
          const isTop = index === dialogs.length - 1;
          return (
            <DialogItem 
              key={dialog.id} 
              dialog={dialog} 
              isTop={isTop} 
              onClose={() => removeDialog(dialog.id)} 
            />
          );
        })}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

function DialogItem({ dialog, isTop, onClose }) {
  const [inputValue, setInputValue] = useState(dialog.promptValue || '');

  const handleConfirm = () => {
    if (dialog.type === 'prompt') dialog.resolve(inputValue);
    else dialog.resolve(true);
    onClose();
  };

  const handleCancel = () => {
    if (dialog.type === 'prompt') dialog.resolve(null);
    else dialog.resolve(false);
    onClose();
  };

  const getIcon = () => {
    if (dialog.type === 'alert') return <AlertCircle size={28} style={{ color: 'var(--blue-500)' }} />;
    if (dialog.type === 'confirm') return <HelpCircle size={28} style={{ color: 'var(--orange-500)' }} />;
    return <FileText size={28} style={{ color: 'var(--navy-600)' }} />;
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: isTop ? 'auto' : 'none'
      }}
    >
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleCancel}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)'
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, type: 'spring', bounce: 0.3 }}
        style={{
          position: 'relative',
          backgroundColor: '#fff',
          width: '100%',
          maxWidth: '420px',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto'
        }}
      >
        <div style={{ padding: '24px 24px 16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '8px' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--gray-50)', borderRadius: '16px', flexShrink: 0 }}>
              {getIcon()}
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '4px', lineHeight: 1.2 }}>
                {dialog.title}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--gray-600)', lineHeight: 1.5, margin: 0 }}>
                {dialog.message}
              </p>
            </div>
          </div>
          
          {dialog.type === 'prompt' && (
            <div style={{ marginTop: '16px' }}>
              <input
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
                placeholder="Ketik di sini..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: 'var(--gray-50)',
                  border: '1px solid var(--gray-200)',
                  borderRadius: '12px',
                  outline: 'none',
                  fontSize: '15px',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--navy-500)';
                  e.target.style.boxShadow = '0 0 0 2px var(--navy-100)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--gray-200)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', backgroundColor: 'var(--gray-50)', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--gray-100)' }}>
          {dialog.type !== 'alert' && (
            <button
              onClick={handleCancel}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                fontWeight: 600,
                color: 'var(--gray-600)',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--gray-200)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              Batal
            </button>
          )}
          <button
            autoFocus={dialog.type !== 'prompt'}
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: dialog.type === 'confirm' ? 'var(--orange-500)' : 'var(--navy-600)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: dialog.type === 'confirm' ? '0 4px 14px 0 rgba(249,115,22,0.39)' : '0 4px 14px 0 rgba(15,23,42,0.39)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = dialog.type === 'confirm' ? '0 6px 20px rgba(249,115,22,0.23)' : '0 6px 20px rgba(15,23,42,0.23)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = dialog.type === 'confirm' ? '0 4px 14px 0 rgba(249,115,22,0.39)' : '0 4px 14px 0 rgba(15,23,42,0.39)';
            }}
          >
            {dialog.type === 'alert' ? 'Mengerti' : dialog.type === 'prompt' ? 'Konfirmasi' : 'Ya, Lanjutkan'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
