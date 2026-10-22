'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Paperclip, Search } from 'lucide-react';
import { apiFetch } from '@/lib/client-api';
import { useDialog } from './DialogProvider';
import { STATUS_STYLES, labelOf } from '@/lib/labels';

// ─── Modal ──────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, size = '', children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div className={`modal ${size}`} initial={{ scale: 0.97, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 20 }} role="dialog" aria-modal="true" aria-label={title}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{title}</div>
                {subtitle && <div className="modal-subtitle">{subtitle}</div>}
              </div>
              <button type="button" onClick={onClose} className="icon-btn modal-close" aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Tabel (otomatis jadi kartu di HP) ──────────────────────────────────────
export function DataTable({ columns, rows, empty = 'Belum ada data.', onRowClick, rowKey = (r) => r.id }) {
  return (
    <div className="table-wrapper table-cards">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="cell-empty" style={{ display: 'table-cell' }}>{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={rowKey(row, i)} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={c.num ? 'num' : ''}>
                  {c.render ? c.render(row) : (row[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ value, label }) {
  if (!value) return <span className="muted">-</span>;
  return <span className={`badge ${STATUS_STYLES[value] ?? 'badge-gray'}`}>{label ?? labelOf(value)}</span>;
}

export function Kpi({ label, value, tone = 'navy', icon: Icon, hint, href }) {
  const body = (
    <div className={`kpi-card ${tone}`}>
      {Icon && <div className="kpi-icon"><Icon size={20} /></div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-trend flat">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{body}</Link> : body;
}

export function Card({ title, actions, children, padding = 20 }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="card-title">{title}</div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

// ─── Form berbasis definisi field ───────────────────────────────────────────
export function Field({ field, value, onChange }) {
  const { name, label, type = 'text', options = [], required, hint, placeholder, min, max, step, disabled, rows = 3 } = field;
  const common = { id: 'f-' + name, name, required, disabled, placeholder };
  let input;
  if (type === 'select') {
    input = (
      <select {...common} className="form-select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!field.noEmpty && <option value="">— Pilih —</option>}
        {options.map((o) => {
          const [v, l] = Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, labelOf(o)];
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    );
  } else if (type === 'textarea') {
    input = <textarea {...common} className="form-input" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  } else if (type === 'checkbox') {
    return (
      <label className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: field.span ? '1 / -1' : undefined }}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span style={{ fontSize: 13.5 }}>{label}</span>
      </label>
    );
  } else if (type === 'personnel') {
    input = <PersonnelPicker value={value} onChange={onChange} params={field.params} required={required} />;
  } else {
    input = (
      <input {...common} type={type} className="form-input" value={value ?? ''} min={min} max={max} step={step}
        inputMode={type === 'number' ? 'decimal' : undefined} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <div className="form-group" style={{ gridColumn: field.span ? '1 / -1' : undefined }}>
      <label className={`form-label ${required ? 'required' : ''}`} htmlFor={'f-' + name}>{label}</label>
      {input}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

export function FormFields({ fields, values, setValues, columns = 2 }) {
  return (
    <div className={columns === 3 ? 'form-grid-3' : columns === 1 ? 'stack' : 'form-grid'} style={columns === 1 ? { gap: 0 } : undefined}>
      {fields.filter((f) => !f.hidden?.(values)).map((f) =>
        f.section ? (
          <div key={f.section} className="section-title" style={{ gridColumn: '1 / -1', marginTop: 8, marginBottom: 0 }}>{f.section}</div>
        ) : (
          <Field key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
        ),
      )}
    </div>
  );
}

// ─── Kirim data ke API + segarkan data server ───────────────────────────────
export function useSubmit() {
  const router = useRouter();
  const { showAlert } = useDialog();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  async function submit(url, { method = 'POST', body, form, success, refresh = true, confirm422 = false } = {}) {
    setBusy(true);
    try {
      const init = form
        ? { method, body: form }
        : { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) };
      const res = await apiFetch(url, init);
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      if (refresh) startTransition(() => router.refresh());
      if (success) await showAlert(success, 'Berhasil');
      return data ?? {};
    } catch (e) {
      // 422 = perlu konfirmasi pengguna (mis. peringatan kelayakan permit).
      if (confirm422 && e.status === 422) return { needsConfirm: true, message: e.message };
      await showAlert(e.message, 'Gagal');
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy };
}

// ─── Filter via query string (filter dijalankan di server) ──────────────────
export function FilterBar({ filters, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const apply = (name, value) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value); else next.delete(name);
    next.delete('page');
    router.push(pathname + (next.toString() ? '?' + next : ''));
  };
  return (
    <div className="toolbar no-print">
      {filters.map((f) =>
        f.type === 'search' ? (
          <form key="q" className="form-group" style={{ position: 'relative', minWidth: 220 }} onSubmit={(e) => { e.preventDefault(); apply('q', q.trim()); }}>
            <label className="form-label">{f.label ?? 'Cari'}</label>
            <Search size={17} style={{ position: 'absolute', left: 12, bottom: 12.5, color: 'var(--gray-400)', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: 38 }} value={q} placeholder={f.placeholder ?? 'Ketik lalu Enter'} onChange={(e) => setQ(e.target.value)} />
          </form>
        ) : (
          <div key={f.name} className="form-group">
            <label className="form-label">{f.label}</label>
            {f.type === 'select' ? (
              <select className="form-select" value={params.get(f.name) ?? f.default ?? ''} onChange={(e) => apply(f.name, e.target.value)}>
                {!f.noAll && <option value="">{f.allLabel ?? 'Semua'}</option>}
                {f.options.map((o) => {
                  const [v, l] = Array.isArray(o) ? o : [o, labelOf(o)];
                  return <option key={v} value={v}>{l}</option>;
                })}
              </select>
            ) : (
              <input className="form-input" type={f.type} value={params.get(f.name) ?? f.default ?? ''} onChange={(e) => apply(f.name, e.target.value)} />
            )}
          </div>
        ),
      )}
      <div className="spacer" />
      {children}
    </div>
  );
}

// ─── Upload: foto dikompres di browser sebelum dikirim (hemat kuota lapangan) ─
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export function FileInput({ label = 'Lampiran', multiple = true, accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx', onChange, capture }) {
  const [names, setNames] = useState([]);
  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className="form-label">{label}</label>
      <label className="btn btn-outline btn-sm" style={{ width: 'fit-content', cursor: 'pointer' }}>
        <Paperclip size={15} /> Pilih file{multiple ? ' / foto' : ''}
        <input type="file" hidden multiple={multiple} accept={accept} capture={capture}
          onChange={async (e) => {
            const files = await Promise.all([...e.target.files].map((f) => compressImage(f)));
            setNames(files.map((f) => f.name));
            onChange(files);
          }} />
      </label>
      {names.length > 0 && <div className="form-hint">{names.join(', ')}</div>}
      <div className="form-hint">Maks. 4 MB per file. Foto otomatis dikompres.</div>
    </div>
  );
}

export function FileLinks({ files, canDelete, onDelete }) {
  if (!files?.length) return <span className="muted">Tidak ada lampiran.</span>;
  const images = files.filter((f) => /^image\//.test(f.mimeType));
  const others = files.filter((f) => !/^image\//.test(f.mimeType));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {images.length > 0 && (
        <div className="photo-grid">
          {images.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}?inline=1`} target="_blank" rel="noreferrer">
              <img src={`/api/files/${f.id}?inline=1`} alt={f.label || f.fileName} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div className="file-list">
        {others.map((f) => (
          <span key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={`/api/files/${f.id}`}><Paperclip size={14} /> {f.label ? f.label + ' — ' : ''}{f.fileName}</a>
            {canDelete && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(f)}>Hapus</button>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Pencarian personel (server-side, sesuai cakupan site pengguna) ─────────
export function PersonnelPicker({ value, onChange, params = {}, required }) {
  const [term, setTerm] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef();
  const paramKey = JSON.stringify(params);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const qs = new URLSearchParams({ q: term, picker: '1', ...JSON.parse(paramKey) });
      fetch('/api/personnel?' + qs).then((r) => (r.ok ? r.json() : { rows: [] })).then((d) => setItems(d.rows ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(timer.current);
  }, [term, paramKey]);
  const current = selected?.id === value ? selected : items.find((i) => i.id === value);
  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input" required={required && !value} placeholder="Cari nama / NIP personel"
        value={open ? term : current ? current.name + (current.nip ? ` · ${current.nip}` : '') : term}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }} />
      {open && items.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxHeight: 260, overflowY: 'auto' }}>
          {items.map((p) => (
            <button type="button" key={p.id} onMouseDown={() => { setSelected(p); onChange(p.id, p); setTerm(''); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: p.id === value ? 'var(--brand-50)' : 'white', cursor: 'pointer', fontSize: 14 }}>
              <strong>{p.name}</strong> <span className="muted">{p.nip && `· NIP ${p.nip} `}· {p.position} · {p.siteName ?? '-'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pager({ page, total, limit = 50 }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (n) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(n));
    router.push(pathname + '?' + next);
  };
  if (!total) return null;
  const pages = Math.ceil(total / limit);
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav aria-label="Halaman data" className="pager no-print">
      <span>Menampilkan {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')} dari {total.toLocaleString('id-ID')} data{pages > 1 ? ` · halaman ${page} dari ${pages}` : ''}</span>
      {pages > 1 && (
        <span className="pager-nav">
          <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>← Sebelumnya</button>
          <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>Berikutnya →</button>
        </span>
      )}
    </nav>
  );
}
