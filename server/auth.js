import crypto from "node:crypto";

const COOKIE = "presensi_sid";
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 jam

function secret() {
  return process.env.SESSION_SECRET || "presensi-dev-secret-ganti-di-produksi";
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function checkPassword(input) {
  const expected = process.env.ADMIN_PASSWORD || "admin123";
  const a = Buffer.from(String(input ?? ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function issueSession(res, name = "Admin") {
  const token = sign({ name, exp: Date.now() + MAX_AGE_MS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

export function currentUser(req) {
  return verify(req.cookies?.[COOKIE]);
}

/** Guard untuk endpoint API — balas 401 JSON. */
export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Sesi berakhir. Silakan masuk lagi." });
  req.user = user;
  next();
}

/** Guard untuk halaman — arahkan ke /login. */
export function requirePage(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  req.user = user;
  next();
}
