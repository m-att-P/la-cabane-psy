// API de l'intranet de La Cabane Psy (Netlify Functions + Netlify Blobs)
// Routes :
//   GET    /api/content            contenu public du site
//   PUT    /api/content            enregistrer le contenu (admin)
//   GET    /api/setup              le premier admin reste-t-il à créer ?
//   POST   /api/setup              créer le premier admin (code de configuration requis)
//   POST   /api/login              connexion -> jeton de session
//   GET    /api/me                 qui suis-je ?
//   GET    /api/users              liste des admins (admin)
//   POST   /api/users              créer un admin (admin)
//   DELETE /api/users/<nom>        supprimer un admin (admin)
//   PUT    /api/password           changer son mot de passe (admin)

import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const SESSION_HOURS = 12;
const MAX_CONTENT_BYTES = 200_000;

const store = () => getStore({ name: "cabane-psy", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (message, status = 400) => json({ error: message }, status);

// ---------- mots de passe ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}
function checkPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- jetons de session (HMAC) ----------
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET manquant ou trop court (16 caractères minimum).");
  return s;
}
const b64 = (s) => Buffer.from(s).toString("base64url");
function signToken(username, pwStamp) {
  const payload = b64(JSON.stringify({ u: username, s: pwStamp, exp: Date.now() + SESSION_HOURS * 3600_000 }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// ---------- utilisateurs ----------
async function getUsers() {
  return (await store().get("users", { type: "json" })) || [];
}
async function saveUsers(users) {
  await store().setJSON("users", users);
}
const publicUser = (u) => ({ username: u.username, createdAt: u.createdAt, createdBy: u.createdBy || null });
const stamp = (u) => u.hash.slice(0, 12); // change quand le mot de passe change -> déconnecte les anciennes sessions

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
function validateNewUser(username, password) {
  if (!USERNAME_RE.test(username || ""))
    return "Nom d'utilisateur : 3 à 30 caractères, minuscules, chiffres, point, tiret ou underscore.";
  if (typeof password !== "string" || password.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  if (password.length > 200) return "Mot de passe trop long.";
  return null;
}

async function currentUser(req) {
  const auth = req.headers.get("authorization") || "";
  const data = readToken(auth.replace(/^Bearer\s+/i, ""));
  if (!data) return null;
  const user = (await getUsers()).find((u) => u.username === data.u);
  if (!user || stamp(user) !== data.s) return null;
  return user;
}

// ---------- contenu ----------
function cleanLink(v) {
  if (typeof v !== "string") return "";
  v = v.trim();
  return /^(https?:\/\/|mailto:)/i.test(v) || v === "" ? v : "https://" + v;
}
function validateContent(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "Contenu invalide.";
  for (const k of ["hero", "about", "actions", "agenda", "bureau", "adhesion", "contact"])
    if (!c[k] || typeof c[k] !== "object") return `Section manquante : ${k}`;
  if (JSON.stringify(c).length > MAX_CONTENT_BYTES) return "Contenu trop volumineux.";
  c.adhesion.link = cleanLink(c.adhesion.link);
  c.contact.instagramUrl = cleanLink(c.contact.instagramUrl);
  return null;
}

const slowDown = () => new Promise((r) => setTimeout(r, 600));

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = req.method;
  const body = async () => {
    try {
      return await req.json();
    } catch {
      return {};
    }
  };

  try {
    // --- contenu public ---
    if (path === "content" && method === "GET") {
      const content = await store().get("content", { type: "json" });
      return json({ content: content || null, updatedAt: (await store().get("content-meta", { type: "json" })) || null });
    }

    // --- premier admin ---
    if (path === "setup" && method === "GET") {
      return json({ needed: (await getUsers()).length === 0 });
    }
    if (path === "setup" && method === "POST") {
      secret();
      if ((await getUsers()).length > 0) return fail("Un administrateur existe déjà.", 403);
      const code = process.env.SETUP_CODE;
      if (!code) return fail("SETUP_CODE n'est pas défini dans les variables d'environnement Netlify.", 500);
      const { setupCode, username, password } = await body();
      if (setupCode !== code) {
        await slowDown();
        return fail("Code de configuration incorrect.", 403);
      }
      const err = validateNewUser(username, password);
      if (err) return fail(err);
      const user = { username, ...hashPassword(password), createdAt: new Date().toISOString(), createdBy: null };
      await saveUsers([user]);
      return json({ token: signToken(username, stamp(user)), user: publicUser(user) });
    }

    // --- connexion ---
    if (path === "login" && method === "POST") {
      const { username, password } = await body();
      const user = (await getUsers()).find((u) => u.username === String(username || "").trim().toLowerCase());
      if (!user || !checkPassword(String(password || ""), user)) {
        await slowDown();
        return fail("Identifiant ou mot de passe incorrect.", 401);
      }
      return json({ token: signToken(user.username, stamp(user)), user: publicUser(user) });
    }

    // --- à partir d'ici : connexion obligatoire ---
    const me = await currentUser(req);
    if (!me) return fail("Session expirée, reconnecte-toi.", 401);

    if (path === "me" && method === "GET") return json({ user: publicUser(me) });

    if (path === "content" && method === "PUT") {
      const { content } = await body();
      const err = validateContent(content);
      if (err) return fail(err);
      await store().setJSON("content", content);
      const meta = { at: new Date().toISOString(), by: me.username };
      await store().setJSON("content-meta", meta);
      return json({ ok: true, updatedAt: meta });
    }

    if (path === "users" && method === "GET") {
      return json({ users: (await getUsers()).map(publicUser) });
    }

    if (path === "users" && method === "POST") {
      const { username, password } = await body();
      const name = String(username || "").trim().toLowerCase();
      const err = validateNewUser(name, password);
      if (err) return fail(err);
      const users = await getUsers();
      if (users.some((u) => u.username === name)) return fail("Ce nom d'utilisateur existe déjà.");
      const user = { username: name, ...hashPassword(password), createdAt: new Date().toISOString(), createdBy: me.username };
      users.push(user);
      await saveUsers(users);
      return json({ user: publicUser(user) }, 201);
    }

    if (path.startsWith("users/") && method === "DELETE") {
      const name = decodeURIComponent(path.slice(6));
      if (name === me.username) return fail("Tu ne peux pas supprimer ton propre compte.");
      const users = await getUsers();
      if (!users.some((u) => u.username === name)) return fail("Administrateur introuvable.", 404);
      await saveUsers(users.filter((u) => u.username !== name));
      return json({ ok: true });
    }

    if (path === "password" && method === "PUT") {
      const { currentPassword, newPassword } = await body();
      if (!checkPassword(String(currentPassword || ""), me)) {
        await slowDown();
        return fail("Mot de passe actuel incorrect.", 403);
      }
      const err = validateNewUser(me.username, newPassword);
      if (err) return fail(err);
      const users = await getUsers();
      const u = users.find((x) => x.username === me.username);
      Object.assign(u, hashPassword(newPassword));
      await saveUsers(users);
      return json({ token: signToken(u.username, stamp(u)) });
    }

    return fail("Route inconnue.", 404);
  } catch (e) {
    console.error(e);
    return fail(e.message || "Erreur serveur.", 500);
  }
};

export const config = { path: "/api/*" };
