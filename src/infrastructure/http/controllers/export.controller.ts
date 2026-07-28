import {
  Controller,
  Get,
  Query,
  Inject,
  Res,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { GenerateWeeklyReport } from '../../../application/usecases/GenerateWeeklyReport';
import { ExcelGeneratorService } from '../../../application/services/ExcelGeneratorService';
import { TokenService } from '../../../domain/ports/TokenService';
import { formatExportFilename } from '../../../application/services/filename-formatter';

@Controller('api/report')
export class ExportController {
  private readonly logger = new Logger(ExportController.name);

  constructor(
    private readonly generateWeeklyReport: GenerateWeeklyReport,
    private readonly excelGenerator: ExcelGeneratorService,
    @Inject('TokenService') private readonly tokenService: TokenService,
  ) {}

  @Get('export')
  async exportExcel(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) {
      throw new BadRequestException('Missing token');
    }

    let userId: string;
    let from: Date;
    let to: Date;

    try {
      const payload = this.tokenService.verifyReportToken(token);
      userId = payload.userId;
      from = new Date(payload.from);
      to = new Date(payload.to);
    } catch {
      throw new NotFoundException('Report not found or link expired');
    }

    try {
      const summary = await this.generateWeeklyReport.execute(userId, { from, to });
      const buffer = await this.excelGenerator.generate(summary, { from, to });

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${formatExportFilename(from, to)}"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });

      res.send(buffer);
    } catch (error) {
      this.logger.error('Failed to generate report', error);
      res.status(500).json({ message: 'Failed to generate report' });
    }
  }
}
