import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  auth,
  body,
  createSession,
  db,
  error,
  logout,
  multipart,
  privateArtist,
  publicArtist,
  removeBlob,
  schema,
  send,
  upload,
} from "../_lib/core.js";

export const config = { api: { bodyParser: false } };

function route(req) {
  const value = req.query?.path;
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return value.split("/").filter(Boolean);

  const pathname = String(req.url || "").split("?")[0];
  const prefix = "/api/artists/";
  if (!pathname.startsWith(prefix)) return [];
  return pathname.slice(prefix.length).split("/").filter(Boolean);
}

async function ensureSeeded() {
  const existing = await db.sql`SELECT name FROM artists`;
  const names = new Set(existing.rows.map((row) => row.name));
  const missing = ["Amanda", "Vortex", "Adam", "Nana", "Max", "GioInk", "Karol", "Nando", "Jujulz"].filter((name) => !names.has(name));
  if (!missing.length) return;
  const passwordHash = await bcrypt.hash("123456", 12);
  for (const name of missing) {
    await db.sql`INSERT INTO artists (id, name, password_hash, requires_password_change) VALUES (${crypto.randomUUID()}, ${name}, ${passwordHash}, TRUE) ON CONFLICT (name) DO NOTHING`;
  }
}

async function readyArtist(req, res) {
  const artist = await auth(req);
  if (!artist) {
    error(res, 401, "Sua sessão expirou. Entre novamente.");
    return null;
  }
  if (artist.requires_password_change) {
    error(res, 403, "Troque sua senha antes de usar o painel.");
    return null;
  }
  return artist;
}

async function login(req, res) {
  await ensureSeeded();
  const input = await body(req);
  const result = await db.sql`SELECT * FROM artists WHERE LOWER(name) = LOWER(${String(input.name || "").trim()})`;
  const artist = result.rows[0];
  if (!artist || !(await bcrypt.compare(String(input.password || ""), artist.password_hash))) {
    return error(res, 401, "Nome ou senha incorretos.");
  }
  const token = await createSession(artist.id);
  return send(res, 200, {
    token,
    artist: privateArtist(artist),
    requiresPasswordChange: Boolean(artist.requires_password_change),
  });
}

async function changePassword(req, res) {
  const artist = await auth(req);
  if (!artist) return error(res, 401, "Sua sessão expirou. Entre novamente.");
  const input = await body(req);
  const currentPassword = String(input.currentPassword || "");
  const newPassword = String(input.newPassword || "");
  if (newPassword.length < 8) return error(res, 400, "A nova senha precisa ter pelo menos 8 caracteres.");
  if (newPassword === currentPassword) return error(res, 400, "Escolha uma senha diferente da atual.");
  if (!(await bcrypt.compare(currentPassword, artist.password_hash))) return error(res, 400, "A senha atual está incorreta.");
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.sql`UPDATE artists SET password_hash = ${passwordHash}, requires_password_change = FALSE WHERE id = ${artist.id}`;
  await db.sql`DELETE FROM sessions WHERE artist_id = ${artist.id}`;
  const token = await createSession(artist.id);
  const updated = { ...artist, requires_password_change: false };
  return send(res, 200, { token, artist: privateArtist(updated), requiresPasswordChange: false });
}

async function publicArtists(req, res) {
  await ensureSeeded();
  const result = await db.sql`SELECT id, name, avatar_url, bio FROM artists ORDER BY created_at ASC`;
  const works = await db.sql`SELECT w.id, w.artist_id, w.url, w.kind, w.title, w.created_at, a.name AS artist FROM works w JOIN artists a ON a.id = w.artist_id ORDER BY w.created_at DESC`;
  return send(res, 200, {
    artists: result.rows.map(publicArtist),
    works: works.rows.map((work) => ({
      id: work.id,
      artistId: work.artist_id,
      artist: work.artist,
      url: work.url,
      kind: work.kind,
      title: work.title,
      createdAt: work.created_at,
    })),
  });
}

async function me(req, res) {
  const artist = await auth(req);
  if (!artist) return error(res, 401, "Sua sessão expirou. Entre novamente.");
  const count = await db.sql`SELECT COUNT(*)::int AS count FROM works WHERE artist_id = ${artist.id}`;
  return send(res, 200, {
    artist: { ...privateArtist(artist), workCount: count.rows[0].count },
    requiresPasswordChange: Boolean(artist.requires_password_change),
  });
}

async function gallery(req, res, artist) {
  const result = await db.sql`SELECT id, url, kind, title, created_at FROM works WHERE artist_id = ${artist.id} ORDER BY created_at DESC`;
  return send(res, 200, {
    items: result.rows.map((item) => ({
      id: item.id,
      url: item.url,
      kind: item.kind,
      title: item.title,
      createdAt: item.created_at,
    })),
  });
}

async function addGallery(req, res, artist) {
  const { fields, file } = await multipart(req);
  if (!file || (!file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/"))) {
    return error(res, 400, "Envie uma imagem ou vídeo válido.");
  }
  const url = await upload(file, `gallery/${artist.id}`);
  const kind = file.mimeType.startsWith("video/") ? "video" : "image";
  const id = crypto.randomUUID();
  const title = String(fields.title || file.filename || "Trabalho").trim().slice(0, 120);
  await db.sql`INSERT INTO works (id, artist_id, url, kind, title, blob_url) VALUES (${id}, ${artist.id}, ${url}, ${kind}, ${title}, ${url})`;
  return send(res, 201, { item: { id, url, kind, title } });
}

async function deleteGallery(req, res, artist, id) {
  const result = await db.sql`SELECT id, blob_url FROM works WHERE id = ${id} AND artist_id = ${artist.id}`;
  const item = result.rows[0];
  if (!item) return error(res, 404, "Trabalho não encontrado.");
  await db.sql`DELETE FROM works WHERE id = ${id} AND artist_id = ${artist.id}`;
  if (item.blob_url) await removeBlob(item.blob_url);
  return send(res, 200, { success: true });
}

async function avatar(req, res, artist) {
  const { file } = await multipart(req);
  if (!file || !file.mimeType.startsWith("image/")) return error(res, 400, "Envie uma imagem de perfil válida.");
  const result = await db.sql`SELECT avatar_url FROM artists WHERE id = ${artist.id}`;
  const previousUrl = result.rows[0]?.avatar_url;
  const url = await upload(file, `avatars/${artist.id}`);
  await db.sql`UPDATE artists SET avatar_url = ${url} WHERE id = ${artist.id}`;
  if (previousUrl && previousUrl !== url) {
    try { await removeBlob(previousUrl); } catch (cleanupError) { console.error("Falha ao remover avatar antigo", cleanupError); }
  }
  return send(res, 200, { avatarUrl: url });
}

async function updateProfile(req, res, artist) {
  const input = await body(req);
  const bio = String(input.bio || "").trim().slice(0, 240);
  await db.sql`UPDATE artists SET bio = ${bio || null} WHERE id = ${artist.id}`;
  return send(res, 200, { artist: { ...privateArtist(artist), bio: bio || null } });
}

export default async function handler(req, res) {
  try {
    await schema();
    const parts = route(req);

    if (parts[0] === "public" && req.method === "GET") return publicArtists(req, res);
    if (parts[0] === "auth" && parts[1] === "login" && req.method === "POST") return login(req, res);
    if (parts[0] === "auth" && parts[1] === "change-password" && req.method === "POST") return changePassword(req, res);
    if (parts[0] === "auth" && parts[1] === "logout" && req.method === "POST") {
      await logout(req);
      return send(res, 200, { success: true });
    }
    if (parts[0] === "me" && parts.length === 1 && req.method === "GET") return me(req, res);

    if (parts[0] === "me" && parts[1] === "gallery") {
      if (req.method === "GET") {
        const artist = await auth(req);
        if (!artist) return error(res, 401, "Sua sessão expirou. Entre novamente.");
        if (artist.requires_password_change) return error(res, 403, "Troque sua senha antes de usar o painel.");
        return gallery(req, res, artist);
      }
      if (req.method === "POST") {
        const artist = await readyArtist(req, res);
        if (!artist) return;
        return addGallery(req, res, artist);
      }
      if (parts.length === 3 && req.method === "DELETE") {
        const artist = await readyArtist(req, res);
        if (!artist) return;
        return deleteGallery(req, res, artist, parts[2]);
      }
    }

    if (parts[0] === "me" && parts[1] === "avatar" && req.method === "POST") {
      const artist = await readyArtist(req, res);
      if (!artist) return;
      return avatar(req, res, artist);
    }

    if (parts[0] === "me" && parts[1] === "profile" && req.method === "PATCH") {
      const artist = await readyArtist(req, res);
      if (!artist) return;
      return updateProfile(req, res, artist);
    }

    return error(res, 404, "Rota não encontrada.");
  } catch (err) {
    console.error("Erro na API de artistas", err);
    return error(res, 500, "Não foi possível concluir a operação agora.");
  }
}
