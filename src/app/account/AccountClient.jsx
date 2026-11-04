'use client';

import { useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Camera, Check, Trash2 } from 'lucide-react';
import { Card, FormFields, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import UserAvatar from '@/components/UserAvatar';
import { ROLE_LABELS } from '@/lib/access';
import { applyAccent } from '@/lib/accent';
import { DEFAULT_THEME, THEME_COLORS } from '@/lib/domain/profile';

const AVATAR_SIZE = 320;

// Foto dipotong persegi dan dikecilkan di browser agar ringan dimuat di setiap halaman.
async function squarePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

export default function AccountClient({ user }) {
  const { submit, busy } = useSubmit();
  const { showAlert, showConfirm } = useDialog();
  const photoInput = useRef(null);
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [profile, setProfile] = useState({ name: user.name, email: user.email, currentPassword: '' });
  const [accent, setAccent] = useState(user.themeColor ?? DEFAULT_THEME);
  const emailChanged = profile.email.trim().toLowerCase() !== user.email;

  const save = async (e) => {
    e.preventDefault();
    if (v.next !== v.confirm) return alert('Konfirmasi kata sandi tidak sama.');
    const ok = await submit('/api/account/password', { body: { current: v.current, next: v.next }, success: 'Kata sandi diubah. Silakan masuk kembali.', refresh: false });
    if (ok) signOut({ callbackUrl: '/login' });
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    const ok = await submit('/api/account/profile', { method: 'PUT', body: profile, success: 'Profil disimpan.' });
    if (ok) setProfile({ ...profile, currentPassword: '' });
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let photo;
    try {
      photo = await squarePhoto(file);
    } catch {
      return showAlert('Foto tidak dapat dibaca. Gunakan file JPG, PNG, atau WEBP.', 'Gagal');
    }
    const form = new FormData();
    form.set('file', photo);
    await submit('/api/account/avatar', { form });
  };

  const removePhoto = async () => {
    if (await showConfirm('Hapus foto profil?')) await submit('/api/account/avatar', { method: 'DELETE' });
  };

  const pickColor = async (key) => {
    setAccent(key);
    applyAccent(key);
    const ok = await submit('/api/account/theme', { method: 'PUT', body: { color: key } });
    if (!ok) {
      setAccent(user.themeColor ?? DEFAULT_THEME);
      applyAccent(user.themeColor);
    }
  };

  return (
    <div className="grid-2">
      <Card title="Profil">
        <div className="profile-photo">
          <UserAvatar name={user.name} fileId={user.avatarFileId} className="lg" />
          <div className="profile-photo-actions">
            <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickPhoto} />
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => photoInput.current?.click()}><Camera size={15} /> {user.avatarFileId ? 'Ganti foto' : 'Unggah foto'}</button>
            {user.avatarFileId && <button type="button" className="btn btn-ghost btn-sm text-red" disabled={busy} onClick={removePhoto}><Trash2 size={15} /> Hapus</button>}
          </div>
        </div>
        {user.isShared ? (
          <dl className="detail-grid">
            <div><dt>Nama</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Peran</dt><dd>{ROLE_LABELS[user.role]}</dd></div>
            {user.operatorName && <div><dt>Operator</dt><dd>{user.operatorName}</dd></div>}
          </dl>
        ) : (
          <form onSubmit={saveProfile}>
            <FormFields columns={1} values={profile} setValues={setProfile} fields={[
              { name: 'name', label: 'Nama lengkap', required: true },
              { name: 'email', label: 'Email', type: 'email', required: true, hint: 'Email ini dipakai untuk login.' },
              { name: 'currentPassword', label: 'Kata sandi saat ini', type: 'password', required: emailChanged, hidden: () => !emailChanged, hint: 'Diperlukan untuk mengubah email.' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan profil</button>
          </form>
        )}
      </Card>
      <div className="stack">
        <Card title="Warna tema">
          <div className="theme-swatches">
            {THEME_COLORS.map((t) => (
              <button key={t.key} type="button" className="theme-swatch" aria-pressed={accent === t.key} onClick={() => pickColor(t.key)}>
                <i style={{ background: t.color }}>{accent === t.key && <Check size={18} />}</i>
                {t.label}
              </button>
            ))}
          </div>
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
    </div>
  );
}
