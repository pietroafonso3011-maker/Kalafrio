import crypto from "node:crypto";
import Busboy from "busboy";
import bcrypt from "bcryptjs";
import { createPool } from "@vercel/postgres";
import { del, put } from "@vercel/blob";
if (!process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NO_SSL || process.env.POSTGRES_URL_NON_POOLING || "";
}
















export const db = createPool({ connectionString: process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL_NO_SSL });


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
  await db.sql`CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, requires_password_change BOOLEAN NOT NULL DEFAULT TRUE, avatar_url TEXT, bio TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await db.sql`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`;
  await db.sql`CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE, url TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, blob_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}










