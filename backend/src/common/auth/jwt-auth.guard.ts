import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { AccessTokenVerifier } from './access-token.verifier';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from './decorators';

export type { AccessTokenPayload } from './access-token.verifier';

/** Authenticates the Bearer token on every non-public route (session-checked). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (isPublic) {
      const optional = this.reflector.getAllAndOverride<boolean>(
        OPTIONAL_AUTH_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!optional || !header) return true;
    }
    if (!header?.startsWith('Bearer '))
      throw new AppException('AUTH_TOKEN_MISSING');
    req.user = await this.verifier.verify(header.slice(7));
    return true;
  }
}
