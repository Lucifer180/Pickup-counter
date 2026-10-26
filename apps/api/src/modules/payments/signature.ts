import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeSignature(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

export function isValidSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const provided = header.trim().replace(/^sha256=/i, '');
  if (!HEX_SHA256.test(provided)) return false;
  const expected = Buffer.from(computeSignature(rawBody, secret), 'hex');
  const received = Buffer.from(provided, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
