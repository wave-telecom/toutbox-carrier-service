import { z } from 'zod';
import { ErrorTypes } from './http-error.js';

/** Media type every error response is served with (RFC 9457). */
export const PROBLEM_JSON_MEDIA_TYPE = 'application/problem+json';

/** One machine-readable validation failure, indexed by the field that caused it. */
export const problemDetailErrorSchema = z.object({
  path: z.string().describe('Dot-separated path to the offending field.'),
  message: z.string().describe('Human-readable description of the failure.'),
  code: z.string().describe('Machine-readable failure code.'),
});

/**
 * The RFC 9457 "Problem Details" body returned for every error response. Routes
 * declare their error responses with this schema; `registerOpenApi` then serves
 * them under {@link PROBLEM_JSON_MEDIA_TYPE} in the generated document.
 *
 * A loose object on purpose: RFC 9457 allows arbitrary extension members, so
 * unknown keys must survive serialisation instead of being stripped.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457
 */
export const problemDetailSchema = z
  .looseObject({
    type: z
      .string()
      .describe('An absolute URI identifying the problem type.')
      .register(z.globalRegistry, { examples: [ErrorTypes.NOT_FOUND] }),
    title: z.string().describe('A short, human-readable summary of the problem.'),
    status: z.number().int().describe('The HTTP status code.'),
    detail: z
      .string()
      .optional()
      .describe('A human-readable explanation specific to this occurrence.'),
    instance: z
      .string()
      .optional()
      .describe('A URI reference identifying the specific occurrence of the problem.'),
    errors: z
      .array(problemDetailErrorSchema)
      .optional()
      .describe('Machine-readable details, e.g. one entry per field validation failure.'),
  })
  .meta({
    id: 'ProblemDetail',
    description: 'RFC 9457 problem details error response.',
  });

/**
 * Builds a route `response` map declaring the given statuses as problem details.
 *
 * Usage: `response: { 201: ruleResponseSchema, ...problemDetailResponses(400, 409) }`.
 */
export function problemDetailResponses<const S extends readonly number[]>(
  ...statuses: S
): Record<S[number], typeof problemDetailSchema> {
  return Object.fromEntries(statuses.map((status) => [status, problemDetailSchema])) as Record<
    S[number],
    typeof problemDetailSchema
  >;
}
