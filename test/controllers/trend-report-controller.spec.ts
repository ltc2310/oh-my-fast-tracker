import { Logger } from '@nestjs/common';
import { TrendReportController } from '../../src/infrastructure/http/controllers/trend-report.controller';
import { GenerateTrendReport, MonthsBelowMinimumError, MonthsLimitExceededError } from '../../src/application/usecases/GenerateTrendReport';
import { ExcelTrendGeneratorService } from '../../src/application/services/ExcelTrendGeneratorService';
import { TokenService } from '../../src/domain/ports/TokenService';
import { TrendReport } from '../../src/domain/entities/TrendReport';
import { Response } from 'express';

describe('TrendReportController', () => {
  let controller: TrendReportController;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockGenerateTrendReport: jest.Mocked<Pick<GenerateTrendReport, 'execute'>>;
  let mockExcelTrendGenerator: jest.Mocked<Pick<ExcelTrendGeneratorService, 'generate'>>;
  let mockResponse: {
    set: jest.Mock;
    send: jest.Mock;
  };

  const validToken = 'valid-jwt-token';
  const tokenPayload = {
    userId: 'user-123',
    from: '2024-01-01T00:00:00.000Z',
    to: '2024-07-31T23:59:59.000Z',
  };

  const mockTrendReport: TrendReport = {
    userId: 'user-123',
    periodStart: '2024-02-01',
    periodEnd: '2024-07-31',
    monthsCount: 6,
    overview: {
      totalSpent: 9000000,
      averageMonthlySpent: 1500000,
      highestMonth: { month: '2024-05', amount: 2500000 },
      lowestMonth: { month: '2024-02', amount: 800000 },
      overallDirection: 'increasing',
      overallChangePercent: 25.5,
      hasIncompleteData: false,
      monthsWithData: 6,
    },
    monthlyBreakdown: [],
    categoryTrends: [],
    topGrowingCategories: [],
    topShrinkingCategories: [],
    generatedAt: '2024-07-15T10:00:00.000Z',
  };

  const mockBuffer = Buffer.from('fake-xlsx-content');

  beforeEach(() => {
    mockTokenService = {
      generateReportToken: jest.fn(),
      verifyReportToken: jest.fn(),
      generateToken: jest.fn(),
      verifyToken: jest.fn(),
    };

    mockGenerateTrendReport = {
      execute: jest.fn(),
    };

    mockExcelTrendGenerator = {
      generate: jest.fn(),
    };

    mockResponse = {
      set: jest.fn(),
      send: jest.fn(),
    };

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    controller = new TrendReportController(
      mockGenerateTrendReport as unknown as GenerateTrendReport,
      mockExcelTrendGenerator as unknown as ExcelTrendGeneratorService,
      mockTokenService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/report/trend', () => {
    it('should return 200 with TrendReport JSON when token is valid and months=6', async () => {
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateTrendReport.execute.mockResolvedValue(mockTrendReport);

      const result = await controller.getTrendReport(validToken, '6');

      expect(mockTokenService.verifyReportToken).toHaveBeenCalledWith(validToken);
      expect(mockGenerateTrendReport.execute).toHaveBeenCalledWith('user-123', {
        months: 6,
        endMonth: undefined,
      });
      expect(result).toEqual(mockTrendReport);
    });

    it('should throw 401 UnauthorizedException when token is missing', async () => {
      await expect(
        controller.getTrendReport(undefined, '6'),
      ).rejects.toMatchObject({
        status: 401,
        response: { error: 'INVALID_TOKEN' },
      });
    });

    it('should throw 401 UnauthorizedException when token is invalid', async () => {
      mockTokenService.verifyReportToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        controller.getTrendReport('bad-token', '6'),
      ).rejects.toMatchObject({
        status: 401,
        response: { error: 'INVALID_TOKEN' },
      });
    });

    it('should throw 400 BadRequestException with MONTHS_BELOW_MINIMUM when months=2', async () => {
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateTrendReport.execute.mockRejectedValue(new MonthsBelowMinimumError());

      await expect(
        controller.getTrendReport(validToken, '2'),
      ).rejects.toMatchObject({
        status: 400,
        response: { error: 'MONTHS_BELOW_MINIMUM', min: 3 },
      });
    });

    it('should throw 400 BadRequestException with MONTHS_LIMIT_EXCEEDED when months=15', async () => {
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateTrendReport.execute.mockRejectedValue(new MonthsLimitExceededError());

      await expect(
        controller.getTrendReport(validToken, '15'),
      ).rejects.toMatchObject({
        status: 400,
        response: { error: 'MONTHS_LIMIT_EXCEEDED', max: 12 },
      });
    });
  });

  describe('GET /api/report/trend/export', () => {
    it('should return xlsx with correct Content-Type and Content-Disposition', async () => {
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateTrendReport.execute.mockResolvedValue(mockTrendReport);
      mockExcelTrendGenerator.generate.mockResolvedValue(mockBuffer);

      await controller.exportTrendReport(validToken, '6', undefined, mockResponse as unknown as Response);

      expect(mockTokenService.verifyReportToken).toHaveBeenCalledWith(validToken);
      expect(mockGenerateTrendReport.execute).toHaveBeenCalledWith('user-123', {
        months: 6,
        endMonth: undefined,
      });
      expect(mockExcelTrendGenerator.generate).toHaveBeenCalledWith(mockTrendReport);
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': expect.stringMatching(
            /^attachment; filename="bao-cao-xu-huong-user-123-2024-02-01-2024-07-31\.xlsx"$/,
          ),
        }),
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockBuffer);
    });

    it('should expose Content-Disposition in Access-Control-Expose-Headers', async () => {
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateTrendReport.execute.mockResolvedValue(mockTrendReport);
      mockExcelTrendGenerator.generate.mockResolvedValue(mockBuffer);

      await controller.exportTrendReport(validToken, '6', undefined, mockResponse as unknown as Response);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Access-Control-Expose-Headers': 'Content-Disposition',
        }),
      );
    });
  });
});
