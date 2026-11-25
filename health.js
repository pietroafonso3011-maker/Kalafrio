import { schema, send, error } from "./_lib/core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return error(res, 405, "Método não permitido");
  try {
    await schema();
    return send(res, 200, { ok: true });
  } catch (err) {
    return error(res, 503, err.message || "Serviço indisponível");
  }
}
