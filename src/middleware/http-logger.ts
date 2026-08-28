// Logger HTTP minimal — loggue chaque requête sous la forme :
//   [12:34:56] GET /api/inventory → 200 (3ms)
// Les requêtes /health sont ignorées (trop de bruit).
import type { Request, Response, NextFunction, RequestHandler } from "express";

const httpLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health") return next();
  const start = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - start;
    const time = new Date().toTimeString().slice(0, 8);
    console.log(`[${time}] ${req.method} ${req.path} → ${res.statusCode} (${elapsed}ms)`);
  });
  next();
};

export default httpLogger;
