import crypto from "node:crypto";

import bcrypt from "bcryptjs";

import { auth, body, createSession, db, error, logout, multipart, privateArtist, publicArtist, removeBlob, schema, send, upload } from "../_lib/core.js";



export const config = { api: { bodyParser: false } };



function route(req) {
  
  const value = req.query.path;
  
  return Array.isArray(value) ? value : String(value || "").split("/").filter(Boolean);
  
}



async function login(req, res) {
  
  const input = await body(req);
  
  const result = await db.sql`SELECT * FROM artists WHERE LOWER(name) = LOWER(${String(input.name || "")})`;
  
  const artist = result.rows[0];
  
  if (!artist || !(await bcrypt.compare(String(input.password || ""), artist.password_hash))) return error(res, 401, "Nome ou senha incorretos");
  
  const token = await createSession(artist.id);
  
  return send(res, 200, { token, artist: privateArtist(artist), requiresPasswordChange: Boolean(artist.requires_password_change) });
  
}



async function changePassword(req, res) {
  
  const artist = await auth(req);
  
  if (!artist) return error(res, 401, "Sessão inválida");
  
  const input = await body(req);
  
  if (!input.newPassword || String(input.newPassword).length < 6) return error(res, 400, "A nova senha precisa ter pelo menos 6 caracteres");
  
  if (!(await bcrypt.compare(String(input.currentPassword || ""), artist.password_hash))) return error(res, 400, "Senha atual incorreta");
  
  const passwordHash = await bcrypt.hash(String(input.newPassword), 12);
  
  await db.sql`UPDATE artists SET password_hash = ${passwordHash}, requires_password_change = FALSE WHERE id = ${artist.id}`;
  
  const token = await createSession(artist.id);
  
  const updated = { ...artist, requires_password_change: false };
  
  return send(res, 200, { token, artist: privateArtist(updated), requiresPasswordChange: false });
  
}



async function publicArtists(req, res) {
  
  const result = await db.sql`SELECT id, name, avatar_url, bio FROM artists ORDER BY created_at ASC`;
  
  const works = await db.sql`SELECT w.id, w.artist_id, w.url, w.kind, w.title, w.created_at, a.name AS artist FROM works w JOIN artists a ON a.id = w.artist_id ORDER BY w.created_at DESC`;
  
  return send(res, 200, { artists: result.rows.map(publicArtist), works: works.rows.map((work) => ({ id: work.id, artistId: work.artist_id, artist: work.artist, url: work.url, kind: work.kind, title: work.title, createdAt: work.created_at })) });
  
}



async function me(req, res) {
  
  const artist = await auth(req);
  
  if (!artist) return error(res, 401, "Sessão inválida");
  
  const count = await db.sql`SELECT COUNT(*)::int AS count FROM works WHERE artist_id = ${artist.id}`;
  
  return send(res, 200, { artist: { ...privateArtist(artist), workCount: count.rows[0].count }, requiresPasswordChange: Boolean(artist.requires_password_change) });
  
}



async function gallery(req, res, artist) {
  
  const result = await db.sql`SELECT id, url, kind, title, created_at FROM works WHERE artist_id = ${artist.id} ORDER BY created_at DESC`;
  
  return send(res, 200, { items: result.rows.map((item) => ({ id: item.id, url: item.url, kind: item.kind, title: item.title, createdAt: item.created_at })) });
  
}



async function addGallery(req, res, artist) {
  
  const { fields, file } = await multipart(req);
  
  if (!file || (!file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/"))) return error(res, 400, "Envie uma imagem ou vídeo válido");
  
  const url = await upload(file, `gallery/${artist.id}`);
  
  const kind = file.mimeType.startsWith("video/") ? "video" : "image";
  
  const id = crypto.randomUUID();
  
  await db.sql`INSERT INTO works (id, artist_id, url, kind, title, blob_url) VALUES (${id}, ${artist.id}, ${url}, ${kind}, ${fields.title || file.filename}, ${url})`;
  
  return send(res, 201, { item: { id, url, kind, title: fields.title || file.filename } });
  
}



async function deleteGallery(req, res, artist, id) {
  
  const result = await db.sql`SELECT id, blob_url FROM works WHERE id = ${id} AND artist_id = ${artist.id}`;
  
  const item = result.rows[0];
  
  if (!item) return error(res, 404, "Trabalho não encontrado");
  
  await db.sql`DELETE FROM works WHERE id = ${id} AND artist_id = ${artist.id}`;
  
  await removeBlob(item.blob_url);
  
  return send(res, 200, { success: true });
  
}



async function avatar(req, res, artist) {
  
  const { file } = await multipart(req);
  
  if (!file || !file.mimeType.startsWith("image/")) return error(res, 400, "Envie uma imagem válida");
  
  const url = await upload(file, `avatars/${artist.id}`);
  
  await db.sql`UPDATE artists SET avatar_url = ${url} WHERE id = ${artist.id}`;
  
  return send(res, 200, { avatarUrl: url });
  
}



export default async function handler(req, res) {
  
  try {
    
    await schema();
    
    const parts = route(req);
    
    if (parts[0] === "public" && req.method === "GET") return publicArtists(req, res);
    
    if (parts[0] === "auth" && parts[1] === "login" && req.method === "POST") return login(req, res);
    
    if (parts[0] === "auth" && parts[1] === "change-password" && req.method === "POST") 



























































