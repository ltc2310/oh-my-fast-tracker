import { Injectable, Inject } from "@nestjs/common";
import jwt, { SignOptions } from "jsonwebtoken";
import { TokenService, ReportTokenPayload } from "../../domain/ports/TokenService";
import { ConfigType } from "@nestjs/config";
import { authConfig } from "../config/app.config";

@Injectable()
export class JwtTokenService implements TokenService {
  private readonly secret: string;
  private readonly expiresIn: SignOptions["expiresIn"] = "7d";

  constructor(
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>
  ) {
    this.secret = config.reportTokenSecret;
  }

  generateReportToken(payload: ReportTokenPayload): string {
    return jwt.sign(
      { sub: payload.userId, from: payload.from, to: payload.to },
      this.secret,
      { expiresIn: this.expiresIn }
    );
  }

  verifyReportToken(token: string): ReportTokenPayload {
    const decoded = jwt.verify(token, this.secret) as { sub: string; from: string; to: string };
    return { userId: decoded.sub, from: decoded.from, to: decoded.to };
  }

  generateToken(userId: string): string {
    return jwt.sign({ sub: userId }, this.secret, { expiresIn: this.expiresIn });
  }

  verifyToken(token: string): string {
    const payload = jwt.verify(token, this.secret) as { sub: string };
    return payload.sub;
  }
}
