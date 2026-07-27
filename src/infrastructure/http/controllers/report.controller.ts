import { Controller, Get, Query, Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import { GenerateWeeklyReport } from "../../../application/usecases/GenerateWeeklyReport";
import { TokenService } from "../../../domain/ports/TokenService";

@Controller("api/report")
export class ReportController {
  constructor(
    private readonly generateWeeklyReport: GenerateWeeklyReport,
    @Inject("TokenService") private readonly tokenService: TokenService
  ) {}

  @Get()
  async getReport(@Query("token") token?: string) {
    if (!token) {
      throw new BadRequestException("Missing token");
    }

    try {
      const payload = this.tokenService.verifyReportToken(token);
      return this.generateWeeklyReport.execute(payload.userId, {
        from: new Date(payload.from),
        to: new Date(payload.to),
      });
    } catch {
      throw new NotFoundException("Report not found or link expired");
    }
  }
}
