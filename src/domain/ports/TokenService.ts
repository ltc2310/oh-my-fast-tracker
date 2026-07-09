export interface TokenService {
  generateToken(userId: string): string;
  verifyToken(token: string): string;
}