import jwt, { SignOptions } from "jsonwebtoken";
import { TokenService } from "../../domain/ports/TokenService";

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: SignOptions["expiresIn"] = "7d"
  ) { }

  generateToken(userId: string): string {
    return jwt.sign({ sub: userId }, this.secret, { expiresIn: this.expiresIn });
  }

  verifyToken(token: string): string {
    const payload = jwt.verify(token, this.secret) as { sub: string };
    return payload.sub;
  }
}