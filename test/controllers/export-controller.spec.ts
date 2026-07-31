import { BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ExportController } from '../../src/infrastructure/http/controllers/export.controller';
import { GenerateWeeklyReport } from '../../src/application/usecases/GenerateWeeklyReport';
import { ExcelGeneratorService } from '../../src/application/services/ExcelGeneratorService';
import { TokenService } from '../../src/domain/ports/TokenService';
import { WeeklySummary } from '../../src/domain/entities/WeeklySummary';
import { Response } from 'express';

describe('ExportController', () => {
  let controller: ExportController;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockGenerateWeeklyReport: jest.Mocked<Pick<GenerateWeeklyReport, 'execute'>>;
  let mockExcelGenerator: jest.Mocked<Pick<ExcelGeneratorService, 'generate'>>;
  let mockResponse: {
    set: jest.Mock;
    send: jest.Mock;
    status: jest.Mock;
    json: jest.Mock;
  };

  const validToken = 'valid-jwt-token';
  const tokenPayload = {
    userId: 'user-123',
    from: '2024-01-01T00:00:00.000Z',
    to: '2024-01-07T23:59:59.000Z',
  };

  const mockSummary: WeeklySummary = {
    total: 150000,
    byCategory: [{ category: 'Ăn uống', total: 150000 }],
    transactions: [
      {
        id: '1',
        userId: 'user-123',
        amount: 150000,
        category: 'Ăn uống',
        note: 'lunch',
        spentAt: new Date('2024-01-05'),
        createdAt: new Date('2024-01-05'),
      },
    ],
    from: new Date('2024-01-01'),
    to: new Date('2024-01-07'),
  };

  const mockBuffer = Buffer.from('fake-xlsx-content');

  beforeEach(() => {
    mockTokenService = {
      generateReportToken: jest.fn(),
      verifyReportToken: jest.fn(),
      generateToken: jest.fn(),
      verifyToken: jest.fn(),
    };

    mockGenerateWeeklyReport = {
      execute: jest.fn(),
    };

    mockExcelGenerator = {
      generate: jest.fn(),
    };

    mockResponse = {
      set: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    mockResponse.status.mockReturnValue(mockResponse);

    // Silence logger output during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    controller = new ExportController(
      mockGenerateWeeklyReport as unknown as GenerateWeeklyReport,
      mockExcelGenerator as unknown as ExcelGeneratorService,
      mockTokenService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('valid token returns 200 with correct headers', () => {
    it('should verify the token and return Excel file with correct Content-Type and Content-Disposition headers', async () => {
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateWeeklyReport.execute.mockResolvedValue(mockSummary);
      mockExcelGenerator.generate.mockResolvedValue(mockBuffer);

      await controller.exportExcel(validToken, mockResponse as unknown as Response);

      expect(mockTokenService.verifyReportToken).toHaveBeenCalledWith(validToken);
      expect(mockGenerateWeeklyReport.execute).toHaveBeenCalledWith(
        'user-123',
        { from: expect.any(Date), to: expect.any(Date) },
      );
      expect(mockExcelGenerator.generate).toHaveBeenCalledWith(
        mockSummary,
        { from: expect.any(Date), to: expect.any(Date) },
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': expect.stringMatching(
          /^attachment; filename="bao-cao-chi-tieu-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx"$/,
        ),
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });
      expect(mockResponse.send).toHaveBeenCalledWith(mockBuffer);
    });
  });

  describe('missing token returns 400', () => {
    it('should throw BadRequestException when token is undefined', async () => {
      await expect(
        controller.exportExcel(undefined, mockResponse as unknown as Response),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with "Missing token" message when token is empty string', async () => {
      await expect(
        controller.exportExcel('', mockResponse as unknown as Response),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('invalid/expired token returns 404', () => {
    it('should throw NotFoundException when token verification fails', async () => {
      mockTokenService.verifyReportToken.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await expect(
        controller.exportExcel('expired-token', mockResponse as unknown as Response),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with "Report not found or link expired" message', async () => {
      mockTokenService.verifyReportToken.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        controller.exportExcel('bad-token', mockResponse as unknown as Response),
      ).rejects.toThrow('Report not found or link expired');
    });
  });

  describe('unexpected error returns 500 and logs the error', () => {
    it('should return 500 when GenerateWeeklyReport throws', async () => {
      const error = new Error('Database connection failed');
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateWeeklyReport.execute.mockRejectedValue(error);

      await controller.exportExcel(validToken, mockResponse as unknown as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Failed to generate report',
      });
    });

    it('should return 500 when ExcelGeneratorService throws', async () => {
      const error = new Error('Excel generation failed');
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateWeeklyReport.execute.mockResolvedValue(mockSummary);
      mockExcelGenerator.generate.mockRejectedValue(error);

      await controller.exportExcel(validToken, mockResponse as unknown as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Failed to generate report',
      });
    });

    it('should log the error at error level before returning 500', async () => {
      const error = new Error('Something broke');
      mockTokenService.verifyReportToken.mockReturnValue(tokenPayload);
      mockGenerateWeeklyReport.execute.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      await controller.exportExcel(validToken, mockResponse as unknown as Response);

      expect(loggerSpy).toHaveBeenCalledWith('Failed to generate report', error);
    });
  });
});
