import type { AuthUser } from '../common/auth/auth-user';
import type { PharmacyContext } from '../common/auth/auth-user';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
      pharmacy?: PharmacyContext;
    }
  }
}

export {};
