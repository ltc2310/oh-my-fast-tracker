import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { appConfig, telegramConfig, supabaseConfig, authConfig, aiConfig } from "./config/app.config";
import { RegexParser } from "./parsers/RegexParser";
import { AIParser } from "./parsers/AIParser";
import { HybridParser } from "./parsers/HybridParser";
import { SupabaseTransactionRepository } from "./repositories/SupabaseTransactionRepository";
import { JwtTokenService } from "./auth/JwtTokenService";
import { TelegramAdapter } from "./channels/TelegramAdapter";

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ConfigModule.forFeature(telegramConfig),
    ConfigModule.forFeature(supabaseConfig),
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(aiConfig),
  ],
  providers: [
    RegexParser,
    AIParser,
    { provide: "Parser", useClass: HybridParser },
    { provide: "TransactionRepository", useClass: SupabaseTransactionRepository },
    { provide: "TokenService", useClass: JwtTokenService },
    { provide: "ChannelAdapter", useClass: TelegramAdapter },
  ],
  exports: [
    "Parser",
    "TransactionRepository",
    "TokenService",
    "ChannelAdapter",
  ],
})
export class InfrastructureModule {}
