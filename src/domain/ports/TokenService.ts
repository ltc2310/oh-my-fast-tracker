export interface ReportTokenPayload {
  userId: string;
  from: string; // ISO date string
  to: string;   // ISO date string
}

export interface TokenService {
  generateReportToken(payload: ReportTokenPayload): string;
  verifyReportToken(token: string): ReportTokenPayload;
  /** @deprecated use generateReportToken */
  generateToken(userId: string): string;
  /** @deprecated use verifyReportToken */
  verifyToken(token: string): string;
}
