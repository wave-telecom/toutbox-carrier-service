/**
 * RFC 9457 "Problem Details" error model (RFC 9457 obsoletes RFC 7807). Every
 * HTTP error in the application extends {@link HttpError} and serialises via
 * {@link HttpError.toProblemDetail} to an `application/problem+json` body.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */

/** Base URI every problem type is namespaced under. */
export const ERROR_TYPE_BASE_URI = 'https://docs.bemobiwave.com/api-reference/errors';

/**
 * Problem type URIs. A frozen `const` object (not a TS `enum`) so the values
 * stay plain strings, which keeps the module safe to import from any layer.
 *
 * Never remove a key: consumers match on the `type` URI.
 */
export const ErrorTypes = {
  VALIDATION_ERROR: `${ERROR_TYPE_BASE_URI}/validation-error`,
  UNAUTHORIZED: `${ERROR_TYPE_BASE_URI}/unauthorized`,
  FORBIDDEN: `${ERROR_TYPE_BASE_URI}/forbidden`,
  NOT_FOUND: `${ERROR_TYPE_BASE_URI}/not-found`,
  CONFLICT: `${ERROR_TYPE_BASE_URI}/conflict`,
  INVALID_STATUS_TRANSITION: `${ERROR_TYPE_BASE_URI}/invalid-status-transition`,
  OPERATION_NOT_ALLOWED: `${ERROR_TYPE_BASE_URI}/operation-not-allowed`,
  NOT_IMPLEMENTED: `${ERROR_TYPE_BASE_URI}/not-implemented`,
  FAILED_DEPENDENCY: `${ERROR_TYPE_BASE_URI}/failed-dependency`,
  BAD_GATEWAY: `${ERROR_TYPE_BASE_URI}/bad-gateway`,
  INTERNAL_SERVER_ERROR: `${ERROR_TYPE_BASE_URI}/internal-server-error`,
} as const;

export type ErrorType = (typeof ErrorTypes)[keyof typeof ErrorTypes];

/**
 * RFC 9457 problem details document.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */
export interface ProblemDetail {
  /** A URI reference that identifies the problem type. */
  type: string;
  /** A short, human-readable summary of the problem type. */
  title: string;
  /** The HTTP status code. */
  status: number;
  /** A human-readable explanation specific to this occurrence of the problem. */
  detail?: string;
  /** A URI reference that identifies the specific occurrence of the problem. */
  instance?: string;
  /** Additional members (extensions). */
  [key: string]: unknown;
}

export abstract class HttpError extends Error {
  abstract readonly status: number;
  abstract readonly type: ErrorType;
  readonly errors?: unknown;
  readonly instance?: string;

  constructor(message: string, errors?: unknown, instance?: string) {
    super(message);
    this.name = this.constructor.name;
    this.errors = errors;
    this.instance = instance;
  }

  /** Serialises the error to an RFC 9457 problem detail. */
  toProblemDetail(): ProblemDetail {
    return {
      type: this.type,
      title: this.name,
      status: this.status,
      detail: this.message,
      ...(this.instance !== undefined ? { instance: this.instance } : {}),
      ...(this.errors !== undefined ? { errors: this.errors } : {}),
    };
  }
}

export class ValidationError extends HttpError {
  readonly status = 400;
  readonly type = ErrorTypes.VALIDATION_ERROR;
}

export class UnauthorizedError extends HttpError {
  readonly status = 401;
  readonly type = ErrorTypes.UNAUTHORIZED;
}

export class ForbiddenError extends HttpError {
  readonly status = 403;
  readonly type = ErrorTypes.FORBIDDEN;
}

export class NotFoundError extends HttpError {
  readonly status = 404;
  readonly type = ErrorTypes.NOT_FOUND;
}

export class ConflictError extends HttpError {
  readonly status = 409;
  readonly type = ErrorTypes.CONFLICT;
}

export class InvalidStatusTransitionHttpError extends HttpError {
  readonly status = 422;
  readonly type = ErrorTypes.INVALID_STATUS_TRANSITION;
}

export class OperationNotAllowedHttpError extends HttpError {
  readonly status = 422;
  readonly type = ErrorTypes.OPERATION_NOT_ALLOWED;
}

export class NotImplementedError extends HttpError {
  readonly status = 501;
  readonly type = ErrorTypes.NOT_IMPLEMENTED;
}

/** The vendor rejected a fixed carrier/service identifier this repo sends — an upstream integration mismatch, not a caller error. */
export class FailedDependencyError extends HttpError {
  readonly status = 424;
  readonly type = ErrorTypes.FAILED_DEPENDENCY;
}

export class BadGatewayError extends HttpError {
  readonly status = 502;
  readonly type = ErrorTypes.BAD_GATEWAY;
}

export class InternalServerError extends HttpError {
  readonly status = 500;
  readonly type = ErrorTypes.INTERNAL_SERVER_ERROR;
}

/**
 * Maps a carrier use case's own `{ status, message }` failure (see
 * `application/carrier-operation-error.ts`) to the matching {@link HttpError}
 * subclass. Purely an HTTP-boundary concern — a use case decides *which*
 * status and message describe its own failure; this only decides which
 * concrete RFC 9457 `type`/title go with that status. Used by both the
 * create and cancel routes.
 */
export function httpErrorForStatus(status: number, message: string): HttpError {
  switch (status) {
    case 400:
      return new ValidationError(message);
    case 404:
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 422:
      return new OperationNotAllowedHttpError(message);
    case 424:
      return new FailedDependencyError(message);
    case 501:
      return new NotImplementedError(message);
    case 502:
      return new BadGatewayError(message);
    default:
      return new InternalServerError(message);
  }
}
