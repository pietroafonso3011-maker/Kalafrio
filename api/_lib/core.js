import crypto from "node:crypto";
import Busboy from "busboy";
import bcrypt from "bcryptjs";
import { createPool } from "@vercel/postgres";
import { del, put } from "@vercel/blob";
if (!process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NO_SSL || process.env.POSTGRES_URL_NON_POOLING || "";
}
































export const db = createPool({ connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NO_SSL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING });




export const artists = ["Amanda", "Vortex", "Adam", "Nana", "Max", "GioInk", "Karol", "Nando", "Jujulz"];
































export function send(res, status, body) {
  res.status(status).json(body);
}
































export function error(res, status, message) {
  send(res, status, { error: message });
}
















