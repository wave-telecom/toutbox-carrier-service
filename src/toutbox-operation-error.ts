/**
 * A Toutbox operation's own failure: the HTTP-status-shaped outcome this
 * library answers with, and why. Deliberately local — this library has no
 * shared error contract with any consumer; how a caller maps this to its own
 * error shape (an HTTP response, a domain error, ...) is the caller's concern.
 */
export interface ToutboxOperationError {
  status: number;
  message: string;
}
