import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ressource') => new AppError(404, 'NOT_FOUND', `${what} introuvable`);
export const badRequest = (msg: string) => new AppError(400, 'BAD_REQUEST', msg);
export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentification du profil requise');

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  return schema.parse(value);
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Paramètres invalides',
        details: error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    const status = (error as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: 'RATE_LIMITED', message: 'Trop de requêtes, réessayez dans un instant.' });
    if (status < 500) return reply.status(status).send({ error: (error as FastifyError).code ?? 'BAD_REQUEST', message: error.message });
    request.log.error({ err: error }, 'Erreur interne');
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' });
  });
}
