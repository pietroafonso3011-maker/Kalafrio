import crypto from "node:crypto";
import Busboy from "busboy";
import bcrypt from "bcryptjs";
import { sql } from "@vercel/postgres";
import { del, put } from "@vercel/blob";
if (!process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NO_SSL || process.env.POSTGRES_URL_NON_POOLING || "";
}


export const artists = ["Amanda", "Vortex", "Adam", "Nana", "Max", "GioInk", "Karol", "Nando", "Jujulz"];


export function send(res, status, body) {
  res.status(status).json(body);
}


export function error(res, status, message) {
  send(res, status, { error: message });
}


export async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}


export async function schema() {
  await sql`CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, requires_password_change BOOLEAN NOT NULL DEFAULT TRUE, avatar_url TEXT, bio TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE, url TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, blob_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}


export async function seed() {
  const passwordHash = await bcrypt.hash("123456", 12);
  for (const name of artists) {
    await sql`INSERT INTO artists (id, name, password_hash, requires_password_change) VALUES (${crypto.randomUUID()}, ${name}, ${passwordHash}, TRUE) ON CONFLICT (name) DO NOTHING`;
  }
}


function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}


export async function createSession(artistId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await sql`INSERT INTO sessions (token_hash, artist_id, expires_at) VALUES (${tokenHash(token)}, ${artistId}, NOW() + INTERVAL '30 days')`;
  return token;
}


export async function auth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const result = await sql`SELECT a.*, s.expires_at FROM sessions s JOIN artists a ON a.id = s.artist_id WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > NOW()`;
  return result.rows[0] || null;
}


export async function logout(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash(token)}`;
}


export function publicArtist(row) {
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url || null, bio: row.bio || null };
}


export function privateArtist(row) {
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url || null, bio: row.bio || null, requiresPasswordChange: Boolean(row.requires_password_change) };
}


export async function multipart(req) {
  return new Promise((resolve, reject) => {
    const parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 50 * 1024 * 1024 } });
    const fields = {};
    let file = null;
    parser.on("field", (name, value) => { fields[name] = value; });
