import { createHmac, timingSafeEqual } from 'node:crypto';

/** Hex HMAC-SHA256 of the exact bytes of the request body. */
export function computeSignature(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Checks X-Signature against the raw body. We verify the bytes we received,
 * never a re-serialised JSON object, because re-serialising can change key
 * order or whitespace and break (or worse, fake) a match.
 * Accepts an optional "sha256=" prefix, which some providers add.
 */
export function isValidSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const provided = header.trim().replace(/^sha256=/i, '');
  if (!HEX_SHA256.test(provided)) return false;
  const expected = Buffer.from(computeSignature(rawBody, secret), 'hex');
  const received = Buffer.from(provided, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
