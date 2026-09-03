/**
 * A carrier operation's own failure: the HTTP status this service answers
 * with, and why. Deliberately local — never shared with `wave-delivery-api`
 * via the framework. There is no real payload on the wire to validate an
 * error shape against (a failure always serialises as an RFC 9457 problem
 * detail, the cross-repo Wave standard), and how *this* network adapter
 * decides to fail is its own implementation detail, not something a BSS
 * module needs to know the shape of beyond the status code and a message.
 */
export interface CarrierOperationError {
  status: number;
  message: string;
}
