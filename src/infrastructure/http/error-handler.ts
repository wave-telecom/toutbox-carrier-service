import type {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  FastifySchemaValidationError,
} from 'fastify';
import { Logger } from '@wave-tech/framework/core';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  HttpError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from './errors/http-error.js';
import { PROBLEM_JSON_MEDIA_TYPE } from './errors/problem-detail.schema.js';

/** Shape of a single machine-readable validation failure. */
interface ProblemDetailError {
  path: string;
  message: string;
  code: string;
}

/**
 * Global Fastify error handler — the only place that turns an error into a
 * response body. It maps validation failures and typed domain errors to the
 * right {@link HttpError}, then serialises everything as an RFC 9457 problem
 * detail. As the domain grows, map new domain errors in {@link toHttpError}.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const httpError = toHttpError(error);

  if (httpError.status >= 500) {
    Logger.error('Unhandled error while processing request', { notify: true }, error);
  } else {
    Logger.warn('Request failed', {
      method: request.method,
      url: request.url,
      statusCode: httpError.status,
      type: httpError.type,
    });
  }

  const problem = httpError.toProblemDetail();
  // RFC 9457: `instance` identifies this occurrence of the problem.
  problem.instance ??= request.url;

  reply.status(httpError.status).type(PROBLEM_JSON_MEDIA_TYPE).send(problem);
}

/**
 * Fastify not-found handler. Without it, an unmatched route answers with
 * Fastify's default `{"message":"Route ... not found"}` body, which is neither
 * `application/problem+json` nor a problem detail.
 */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  errorHandler(
    new NotFoundError(`Route ${request.method} ${request.url} not found`),
    request,
    reply,
  );
}

function toHttpError(error: FastifyError | Error): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  // The request failed the route's Zod schema (body/params/querystring/headers).
  // The type provider flattens each Zod issue into Fastify's validation shape.
  if (hasZodFastifySchemaValidationErrors(error)) {
    return new ValidationError('Request validation failed', error.validation.map(schemaErrors));
  }

  // A Zod schema parsed by hand, e.g. inside a use case.
  if (error instanceof z.ZodError) {
    return new ValidationError(
      'Request validation failed',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    );
  }

  // The handler returned something the response schema rejects. That is a bug in
  // this service, not in the request, so it must not surface as a 4xx.
  if (isResponseSerializationError(error)) {
    return new InternalServerError('An unexpected error occurred');
  }

  // Fastify's own (Ajv) schema validation errors, for anything not going through
  // the Zod type provider: FST_ERR_VALIDATION / 400.
  const fastifyError = error as FastifyError;
  if (fastifyError.code === 'FST_ERR_VALIDATION' || fastifyError.statusCode === 400) {
    return new ValidationError(
      'Request validation failed',
      (fastifyError.validation ?? []).map(schemaErrors),
    );
  }

  // Never leak the underlying message or stack in a 500 body.
  return new InternalServerError('An unexpected error occurred');
}

/**
 * One `{ path, message, code }` entry per Fastify validation failure, so Zod and
 * Ajv failures reach consumers under a single contract.
 */
function schemaErrors(failure: FastifySchemaValidationError): ProblemDetailError {
  const missingProperty = (failure.params as { missingProperty?: string } | undefined)
    ?.missingProperty;
  const path = failure.instancePath.replace(/^\//, '').replaceAll('/', '.');

  return {
    path: path || missingProperty || '',
    message: failure.message ?? 'is invalid',
    code: failure.keyword,
  };
}
