import { createHash } from "node:crypto";
export async function consumeLoginAttempt(db, email, ip, now = Date.now()) {
  const resetAt = new Date((Math.floor(now / 900000) + 1) * 900000);
  const window = Math.floor(now / 900000);
  for (const [type, value, limit] of [
    ["account", email, 10],
    ["ip", ip, 100],
  ]) {
    const key =
      type +
      ":" +
      createHash("sha256").update(value).digest("hex") +
      ":" +
      window;
    const row = await db.loginAttempt.upsert({
      where: { key },
      create: { key, attempts: 1, resetAt },
      update: { attempts: { increment: 1 } },
    });
    if (row.attempts > limit) return false;
  }
  await db.loginAttempt.deleteMany({
    where: { resetAt: { lt: new Date(now) } },
  });
  return true;
}
export function validSession(token, user) {
  return Boolean(
    user?.isActive &&
    Number.isInteger(token.sessionVersion) &&
    token.sessionVersion === user.sessionVersion,
  );
}
