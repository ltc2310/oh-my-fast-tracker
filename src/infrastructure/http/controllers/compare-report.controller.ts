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
  CompareMonths,
  SameMonthError,
  InvalidMonthError,
} from '../../../application/usecases/CompareMonths';
import { ExcelCompareGeneratorService } from '../../../application/services/ExcelCompareGeneratorService';
import { TokenService } from '../../../domain/ports/TokenService';
import { formatCompareExportFilename } from '../../../application/services/filename-formatter';
import { MonthComparisonResult } from '../../../domain/entities/MonthComparisonResult';

@Controller('api/report/compare')
export class CompareReportController {
  private readonly logger = new Logger(CompareReportController.name);

  constructor(
    private readonly compareMonths: CompareMonths,
    private readonly excelCompareGenerator: ExcelCompareGeneratorService,
    @Inject('TokenService') private readonly tokenService: TokenService,
  ) {}

  @Get()
  async getCompareReport(
    @Query('token') token?: string,
    @Query('monthA') monthAStr?: string,
    @Query('yearA') yearAStr?: string,
    @Query('monthB') monthBStr?: string,
    @Query('yearB') yearBStr?: string,
  ): Promise<MonthComparisonResult> {
    const userId = this.verifyToken(token);
    this.validateYears(yearAStr, yearBStr);
    const { monthA, yearA, monthB, yearB } = this.parseAndValidateParams(
      monthAStr,
      yearAStr!,
      monthBStr,
      yearBStr!,
    );

    try {
      return await this.compareMonths.execute(userId, { monthA, yearA, monthB, yearB });
    } catch (error) {
      if (error instanceof SameMonthError) {
        throw new BadRequestException({ error: 'SAME_MONTH' });
      }
      if (error instanceof InvalidMonthError) {
        throw new BadRequestException({ error: 'INVALID_MONTH' });
      }
      this.logger.error('Failed to generate compare report', error);
      throw new InternalServerErrorException({ error: 'INTERNAL_ERROR' });
    }
  }

  @Get('export')
  async exportCompareReport(
    @Query('token') token?: string,
    @Query('monthA') monthAStr?: string,
    @Query('yearA') yearAStr?: string,
    @Query('monthB') monthBStr?: string,
    @Query('yearB') yearBStr?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const userId = this.verifyToken(token);
    this.validateYears(yearAStr, yearBStr);
    const { monthA, yearA, monthB, yearB } = this.parseAndValidateParams(
      monthAStr,
      yearAStr!,
      monthBStr,
      yearBStr!,
    );

    try {
      const result = await this.compareMonths.execute(userId, { monthA, yearA, monthB, yearB });
      const buffer = await this.excelCompareGenerator.generate(result);

      const filename = formatCompareExportFilename(monthA, yearA, monthB, yearB);

      res!.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });

      res!.send(buffer);
    } catch (error) {
      if (error instanceof SameMonthError) {
        throw new BadRequestException({ error: 'SAME_MONTH' });
      }
      if (error instanceof InvalidMonthError) {
        throw new BadRequestException({ error: 'INVALID_MONTH' });
      }
      this.logger.error('Failed to export compare report', error);
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

  private validateYears(yearAStr?: string, yearBStr?: string): void {
    if (!yearAStr || !yearBStr) {
      throw new BadRequestException({ error: 'MISSING_YEAR' });
    }
  }

  private parseAndValidateParams(
    monthAStr?: string,
    yearAStr?: string,
    monthBStr?: string,
    yearBStr?: string,
  ): { monthA: number; yearA: number; monthB: number; yearB: number } {
    const monthA = parseInt(monthAStr ?? '', 10);
    const monthB = parseInt(monthBStr ?? '', 10);
    const yearA = parseInt(yearAStr ?? '', 10);
    const yearB = parseInt(yearBStr ?? '', 10);

    if (isNaN(monthA) || monthA < 1 || monthA > 12) {
      throw new BadRequestException({ error: 'INVALID_MONTH' });
    }
    if (isNaN(monthB) || monthB < 1 || monthB > 12) {
      throw new BadRequestException({ error: 'INVALID_MONTH' });
    }

    return { monthA, yearA, monthB, yearB };
  }
}
