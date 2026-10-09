import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { AppError } from '../lib/errors';
export type Identity = { id: string; role: Role };
declare global { namespace Express { interface Request { identity?: Identity } } }
export function secret() { const value = process.env.JWT_SECRET; if (!value || value.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters'); return value; }
export function sign(identity: Identity) { return jwt.sign({ id: identity.id, role: identity.role }, secret(), { expiresIn: '12h', issuer: 'cue-club', audience: 'cue-app' }); }
export function verify(token: string): Identity { return jwt.verify(token, secret(), { issuer: 'cue-club', audience: 'cue-app' }) as Identity; }
export function auth(req: Request, _res: Response, next: NextFunction) {
  try { req.identity = verify(req.cookies?.cue_session); next(); } catch { next(new AppError('UNAUTHENTICATED', 'Vui lòng đăng nhập.', 401)); }
}
export function roles(...allowed: Role[]) { return (req: Request, _res: Response, next: NextFunction) => allowed.includes(req.identity!.role) ? next() : next(new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', 403)); }
export function setCookie(res: Response, token: string) { res.cookie('cue_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 12 * 3600000, path: '/' }); }
