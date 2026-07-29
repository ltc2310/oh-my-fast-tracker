import { Module } from "@nestjs/common";
import { RecordTransaction } from "./usecases/RecordTransaction";
import { GenerateWeeklyReport } from "./usecases/GenerateWeeklyReport";
import { GenerateTrendReport } from "./usecases/GenerateTrendReport";
import { ExcelGeneratorService } from "./services/ExcelGeneratorService";
import { TrendAnalysisService } from "./services/TrendAnalysisService";
import { ExcelTrendGeneratorService } from "./services/ExcelTrendGeneratorService";

/**
 * Application module only declares use cases as providers.
 * The port tokens (Parser, TransactionRepository) are resolved from
 * InfrastructureModule which must be imported by any module that
 * imports ApplicationModule, or made global.
 */
@Module({
  providers: [
    RecordTransaction,
    GenerateWeeklyReport,
    GenerateTrendReport,
    ExcelGeneratorService,
    TrendAnalysisService,
    ExcelTrendGeneratorService,
  ],
  exports: [
    RecordTransaction,
    GenerateWeeklyReport,
    GenerateTrendReport,
    ExcelGeneratorService,
    TrendAnalysisService,
    ExcelTrendGeneratorService,
  ],
})
export class ApplicationModule {}
