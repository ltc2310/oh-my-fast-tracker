import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ApplicationModule } from "../../application/application.module";
import { InfrastructureModule } from "../infrastructure.module";
import { appConfig, adminConfig } from "../config/app.config";
import { HealthController } from "./controllers/health.controller";
import { ReportController } from "./controllers/report.controller";
import { ExportController } from "./controllers/export.controller";
import { TrendReportController } from "./controllers/trend-report.controller";
import { CompareReportController } from "./controllers/compare-report.controller";
import { AdminUserController } from "./controllers/admin-user.controller";
import { AdminSecretGuard } from "./guards/admin-secret.guard";
import { BotService } from "../channels/bot.service";

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ConfigModule.forFeature(adminConfig),
    ApplicationModule,
    InfrastructureModule,
  ],
  controllers: [HealthController, ReportController, ExportController, TrendReportController, CompareReportController, AdminUserController],
  providers: [BotService, AdminSecretGuard],
})
export class HttpModule {}
