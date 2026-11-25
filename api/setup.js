import { error, schema, seed, send } from "./_lib/core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return error(res, 405, "Método não permitido");
  if (!process.env.SETUP_SECRET || req.headers["x-setup-secret"] !== process.env.SETUP_SECRET) return error(res, 401, "Não autorizado");
  try {
    await schema();
    await seed();
    return send(res, 200, { success: true });
  } catch (err) {
    return error(res, 500, err.message || "Falha ao inicializar o banco");
  }
}
