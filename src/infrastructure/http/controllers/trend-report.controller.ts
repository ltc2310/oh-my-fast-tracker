import {
  Controller,
  Get,
  Query,
  Inject,
  Res,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  GenerateTrendReport,
  MonthsBelowMinimumError,
  MonthsLimitExceededError,
} from '../../../application/usecases/GenerateTrendReport';
import { ExcelTrendGeneratorService } from '../../../application/services/ExcelTrendGeneratorService';
import { TokenService } from '../../../domain/ports/TokenService';
import { formatTrendExportFilename } from '../../../application/services/filename-formatter';
import { TrendReport } from '../../../domain/entities/TrendReport';

@Controller('api/report/trend')
export class TrendReportController {
  private readonly logger = new Logger(TrendReportController.name);

  constructor(
    private readonly generateTrendReport: GenerateTrendReport,
    private readonly excelTrendGenerator: ExcelTrendGeneratorService,
    @Inject('TokenService') private readonly tokenService: TokenService,
  ) {}

  @Get()
  async getTrendReport(
    @Query('token') token?: string,
    @Query('months') monthsStr?: string,
    @Query('endMonth') endMonth?: string,
  ): Promise<TrendReport> {
    const userId = this.verifyToken(token);
    const months = this.parseMonths(monthsStr);

    try {
      return await this.generateTrendReport.execute(userId, { months, endMonth });
    } catch (error) {
      if (error instanceof MonthsBelowMinimumError) {
        throw new BadRequestException({ error: 'MONTHS_BELOW_MINIMUM', min: 3 });
      }
      if (error instanceof MonthsLimitExceededError) {
        throw new BadRequestException({ error: 'MONTHS_LIMIT_EXCEEDED', max: 12 });
      }
      this.logger.error('Failed to generate trend report', error);
      throw new InternalServerErrorException({ error: 'INTERNAL_ERROR' });
    }
  }

  @Get('export')
  async exportTrendReport(
    @Query('token') token?: string,
    @Query('months') monthsStr?: string,
    @Query('endMonth') endMonth?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const userId = this.verifyToken(token);
    const months = this.parseMonths(monthsStr);

    try {
      const report = await this.generateTrendReport.execute(userId, { months, endMonth });
      const buffer = await this.excelTrendGenerator.generate(report);

      const filename = formatTrendExportFilename(
        userId,
        report.periodStart,
        report.periodEnd,
      );

      res!.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });

      res!.send(buffer);
    } catch (error) {
      if (error instanceof MonthsBelowMinimumError) {
        throw new BadRequestException({ error: 'MONTHS_BELOW_MINIMUM', min: 3 });
      }
      if (error instanceof MonthsLimitExceededError) {
        throw new BadRequestException({ error: 'MONTHS_LIMIT_EXCEEDED', max: 12 });
      }
      this.logger.error('Failed to export trend report', error);
      throw new InternalServerErrorException({ error: 'INTERNAL_ERROR' });
    }
  }

  private verifyToken(token?: string): string {
    if (!token) {
      throw new UnauthorizedException({ error: 'INVALID_TOKEN' });
    }

    try {
      const payload = this.tokenService.verifyReportToken(token);
      return payload.userId;
    } catch {
      throw new UnauthorizedException({ error: 'INVALID_TOKEN' });
    }
  }

  private parseMonths(monthsStr?: string): number {
    if (!monthsStr) return 6;
    const parsed = parseInt(monthsStr, 10);
    return isNaN(parsed) ? 6 : parsed;
  }
}
