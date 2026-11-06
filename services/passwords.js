import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const expected = Buffer.from(hash, 'hex'), actual = await scrypt(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  if (stored.startsWith('$2')) {
    const { default: bcrypt } = await import('bcrypt');
    return bcrypt.compare(password, stored);
  }
  return false;
}
