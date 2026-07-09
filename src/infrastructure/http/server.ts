import express, { Express } from "express";
import cors from "cors";
import { GenerateWeeklyReport } from "../../application/usecases/GenerateWeeklyReport";
import { TokenService } from "../../domain/ports/TokenService";
import { TransactionRepository } from "../../domain/ports/TransactionRepository";


export function createHttpServer(
  generateWeeklyReport: GenerateWeeklyReport,
  tokenService: TokenService,
  repository: TransactionRepository,
  corsOrigin: string,
  cronSecret: string,
  sendWeeklyReports: (userIds: string[]) => Promise<void>
): Express {
  const app = express();
  app.use(cors({ origin: corsOrigin }));

  app.get("/api/report", async (req, res) => {
    const token = req.query.token;

    if (typeof token !== "string") {
      res.status(400).json({ error: "Missing token" });
      return;
    }

    let userId: string;
    try {
      userId = tokenService.verifyToken(token);
    } catch {
      res.status(404).json({ error: "Report not found or link expired" });
      return;
    }

    const summary = await generateWeeklyReport.execute(userId);
    res.json(summary);
  });

  app.post("/internal/send-weekly-reports", async (req, res) => {
    if (req.header("x-cron-secret") !== cronSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userIds = await repository.findDistinctUserIds();
    await sendWeeklyReports(userIds);

    res.json({ sent: userIds.length });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}