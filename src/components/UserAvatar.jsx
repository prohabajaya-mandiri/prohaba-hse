const initials = (name) => (name || 'U').trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export default function UserAvatar({ name, fileId, className = '' }) {
  return (
    <span className={`user-avatar ${className}`.trim()} aria-hidden>
      {fileId ? <img src={`/api/files/${fileId}?inline=1`} alt="" /> : initials(name)}
    </span>
  );
}
