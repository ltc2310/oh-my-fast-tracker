import { Module } from "@nestjs/common";
import { RecordTransaction } from "./usecases/RecordTransaction";
import { GenerateWeeklyReport } from "./usecases/GenerateWeeklyReport";
import { ExcelGeneratorService } from "./services/ExcelGeneratorService";

/**
 * Application module only declares use cases as providers.
 * The port tokens (Parser, TransactionRepository) are resolved from
 * InfrastructureModule which must be imported by any module that
 * imports ApplicationModule, or made global.
 */
@Module({
  providers: [RecordTransaction, GenerateWeeklyReport, ExcelGeneratorService],
  exports: [RecordTransaction, GenerateWeeklyReport, ExcelGeneratorService],
})
export class ApplicationModule {}
