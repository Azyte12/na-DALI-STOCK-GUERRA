import { randomBytes, timingSafeEqual } from 'node:crypto';
import { User } from '../models/userModel.js';
export const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
export function csrfToken(req) { return req.session.csrfToken ||= randomBytes(24).toString('hex'); }
export function checkCsrf(req, res, next) {
  const expected = req.session.csrfToken, supplied = req.get('x-csrf-token') || req.body?._csrf;
  if (typeof supplied !== 'string' || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Your session expired. Refresh the page and try again.' });
  }
  next();
}
export const requireUser = asyncHandler(async (req, res, next) => {
  const user = req.session.userId ? await User.findByPk(req.session.userId) : null;
  if (!user) return req.originalUrl.startsWith('/api') ? res.status(401).json({ error: 'Sign in to continue.' }) : res.redirect('/login');
  req.user = user; next();
});
export function requireWriter(req, res, next) {
  if (!['admin', 'staff'].includes(req.user.role)) return res.status(403).json({ error: 'This account has read-only access.' });
  next();
}
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator approval is required.' });
  next();
}
