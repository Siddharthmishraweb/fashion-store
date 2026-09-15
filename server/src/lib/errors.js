/*
 * One error type for anything the client is allowed to see. Everything else
 * bubbles up as a 500 with a generic message so internals never leak.
 */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
    this.expose = true
  }
}

export const badRequest = (message = 'Invalid request', details) => new HttpError(400, message, details)
export const unauthorized = (message = 'Please sign in to continue') => new HttpError(401, message)
export const forbidden = (message = 'You do not have access to this resource') => new HttpError(403, message)
export const notFound = (message = 'Not found') => new HttpError(404, message)
export const conflict = (message = 'That record already exists') => new HttpError(409, message)
export const tooMany = (message = 'Too many requests. Please slow down.') => new HttpError(429, message)

/** Installed as Fastify's error handler. */
export function errorHandler(error, request, reply) {
  if (error instanceof HttpError) {
    return reply.code(error.status).send({ message: error.message, ...(error.details ? { details: error.details } : {}) })
  }

  // Fastify schema validation failures are client errors, not crashes.
  if (error.validation) {
    return reply.code(400).send({ message: 'Some of the submitted values are not valid.' })
  }
  if (error.statusCode === 429) {
    return reply.code(429).send({ message: 'Too many requests. Please slow down.' })
  }
  if (error.statusCode === 413) {
    return reply.code(413).send({ message: 'That payload is too large.' })
  }

  // Unique violation, foreign key violation: surface as a clean 409.
  if (error.code === '23505' || error.code === '23503' || error.code === '23P01') {
    return reply.code(409).send({ message: 'That record conflicts with one that already exists.' })
  }

  // Anything Fastify itself rejects before a handler runs (unparseable body,
  // unsupported media type, malformed URL) is the caller's mistake, so keep the
  // status it chose instead of reporting a server fault. The message is still
  // ours: framework text can name internals.
  if (error.statusCode >= 400 && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ message: 'That request could not be processed as sent.' })
  }

  request.log.error({ err: error, url: request.url }, 'unhandled request error')
  return reply.code(500).send({ message: 'Something went wrong. Please try again.' })
}
