'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Card, FormFields, useSubmit } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/access';

export default function AccountClient({ user }) {
  const { submit, busy } = useSubmit();
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const save = async (e) => {
    e.preventDefault();
    if (v.next !== v.confirm) return alert('Konfirmasi kata sandi tidak sama.');
    const ok = await submit('/api/account/password', { body: { current: v.current, next: v.next }, success: 'Kata sandi diubah. Silakan masuk kembali.', refresh: false });
    if (ok) signOut({ callbackUrl: '/login' });
  };
  return (
    <div className="grid-2">
      <Card title="Profil">
        <dl className="detail-grid">
          <div><dt>Nama</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Peran</dt><dd>{ROLE_LABELS[user.role]}</dd></div>
          {user.operatorName && <div><dt>Operator</dt><dd>{user.operatorName}</dd></div>}
        </dl>
      </Card>
      <Card title="Ganti kata sandi">
        {user.isShared ? (
          <p className="muted">Kata sandi akun bersama dikelola oleh HO HSE. PIN operator dapat direset melalui HO HSE.</p>
        ) : (
          <form onSubmit={save}>
            <FormFields columns={1} values={v} setValues={setV} fields={[
              { name: 'current', label: 'Kata sandi lama', type: 'password', required: true },
              { name: 'next', label: 'Kata sandi baru', type: 'password', required: true, hint: 'Minimal 10 karakter.' },
              { name: 'confirm', label: 'Ulangi kata sandi baru', type: 'password', required: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Card>
    </div>
  );
}
