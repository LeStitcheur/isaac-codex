/**
 * Authentification des profils.
 * - Chaque profil reçoit un jeton aléatoire de 256 bits (jamais stocké en clair : seul son SHA-256 est conservé).
 * - L'identifiant du profil (UUID) n'est PAS un secret : sans jeton valide pour CE profil, l'API répond 404.
 * - Un mot de passe facultatif (scrypt) permet de récupérer le profil sur un autre appareil.
 */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { InStatement, ProfileDb } from '../db/profile-db.js';
import { notFound, unauthorized } from './errors.js';

export const newProfileId = () => randomUUID();
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Insertion d'un jeton + révocation des plus anciens (au plus 20 jetons actifs par profil). */
export function issueTokenStatements(profileId: string, token: string): InStatement[] {
  const now = new Date().toISOString();
  return [
    { sql: 'INSERT INTO profile_tokens (token_hash, profile_id, created_at, last_used_at) VALUES (?,?,?,?)', args: [hashToken(token), profileId, now, now] },
    {
      sql: `DELETE FROM profile_tokens WHERE profile_id = ? AND token_hash NOT IN (
         SELECT token_hash FROM profile_tokens WHERE profile_id = ? ORDER BY last_used_at DESC LIMIT 20)`,
      args: [profileId, profileId],
    },
  ];
}

export async function issueToken(profiles: ProfileDb, profileId: string): Promise<string> {
  const token = newToken();
  await profiles.batch(issueTokenStatements(profileId, token), 'write');
  return token;
}

function bearer(request: FastifyRequest): string | null {
  const h = request.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t.length >= 20 && t.length <= 200 ? t : null;
}

/** Profil associé au jeton, ou null (sans erreur). */
export async function optionalProfileId(profiles: ProfileDb, request: FastifyRequest): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  const hash = hashToken(token);
  const row = (await profiles.execute({ sql: 'SELECT profile_id, last_used_at FROM profile_tokens WHERE token_hash = ?', args: [hash] })).rows[0];
  if (!row) return null;
  if (Date.now() - Date.parse(row.last_used_at as string) > 3_600_000) {
    await profiles.execute({ sql: 'UPDATE profile_tokens SET last_used_at = ? WHERE token_hash = ?', args: [new Date().toISOString(), hash] });
  }
  return row.profile_id as string;
}

/** Exige un jeton valide pour le profil demandé. Répond 404 (et non 403) pour ne pas révéler l'existence des profils. */
export async function requireProfile(profiles: ProfileDb, request: FastifyRequest, profileId?: string): Promise<string> {
  const id = await optionalProfileId(profiles, request);
  if (!id) throw unauthorized();
  if (profileId !== undefined && id !== profileId) throw notFound('Profil');
  return id;
}

export async function revokeToken(profiles: ProfileDb, request: FastifyRequest): Promise<void> {
  const token = bearer(request);
  if (token) await profiles.execute({ sql: 'DELETE FROM profile_tokens WHERE token_hash = ?', args: [hashToken(token)] });
}
