import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { appConfig, telegramConfig, supabaseConfig, authConfig, aiConfig, adminConfig } from "./config/app.config";
import { RegexParser } from "./parsers/RegexParser";
import { AIParser } from "./parsers/AIParser";
import { HybridParser } from "./parsers/HybridParser";
import { RegexEditMatcher } from "./parsers/RegexEditMatcher";
import { AIEditDetector } from "./parsers/AIEditDetector";
import { HybridEditDetector } from "./parsers/HybridEditDetector";
import { SupabaseTransactionRepository } from "./repositories/SupabaseTransactionRepository";
import { SupabaseUserRepository } from "./repositories/SupabaseUserRepository";
import { SupabaseNotificationPreferenceRepository } from "./repositories/SupabaseNotificationPreferenceRepository";
import { JwtTokenService } from "./auth/JwtTokenService";
import { TelegramAdapter } from "./channels/TelegramAdapter";
import { TelegramNotificationSender } from "./channels/TelegramNotificationSender";
import { GeminiMultimodalParser } from "./parsers/GeminiMultimodalParser";

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ConfigModule.forFeature(telegramConfig),
    ConfigModule.forFeature(supabaseConfig),
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(aiConfig),
    ConfigModule.forFeature(adminConfig),
  ],
  providers: [
    RegexParser,
    AIParser,
    { provide: "Parser", useClass: HybridParser },
    { provide: "TransactionRepository", useClass: SupabaseTransactionRepository },
    { provide: "UserRepository", useClass: SupabaseUserRepository },
    { provide: "NotificationPreferenceRepository", useClass: SupabaseNotificationPreferenceRepository },
    { provide: "TokenService", useClass: JwtTokenService },
    { provide: "ChannelAdapter", useClass: TelegramAdapter },
    { provide: "NotificationSender", useClass: TelegramNotificationSender },
    RegexEditMatcher,
    AIEditDetector,
    { provide: "EditIntentDetector", useClass: HybridEditDetector },
    GeminiMultimodalParser,
    { provide: "MultimodalParser", useClass: GeminiMultimodalParser },
  ],
  exports: [
    "Parser",
    "TransactionRepository",
    "UserRepository",
    "NotificationPreferenceRepository",
    "TokenService",
    "ChannelAdapter",
    "NotificationSender",
    "EditIntentDetector",
    "MultimodalParser",
  ],
})
export class InfrastructureModule {}
