import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ApplicationModule } from "../../application/application.module";
import { InfrastructureModule } from "../infrastructure.module";
import { appConfig } from "../config/app.config";
import { HealthController } from "./controllers/health.controller";
import { ReportController } from "./controllers/report.controller";
import { ExportController } from "./controllers/export.controller";
import { BotService } from "../channels/bot.service";

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ApplicationModule,
    InfrastructureModule,
  ],
  controllers: [HealthController, ReportController, ExportController],
  providers: [BotService],
})
export class HttpModule {}
