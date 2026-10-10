// Small HTTP helpers shared by the route modules: typed errors, async
// wrapping, input validation and the JSON error handler.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = message => new HttpError(400, message);

// Forward rejected promises from async handlers to the error middleware.
export const wrap = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const MAX_INT = 2147483647;

export const parseId = (value, label = 'ID') => {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,9}$/.test(text) || Number(text) > MAX_INT) {
    throw badRequest(`Invalid ${label}`);
  }
  return Number(text);
};

export const optionalId = (value, label) => (value == null || value === '' ? null : parseId(value, label));

export const parsePagination = (query, { defaultLimit = 50, maxLimit = 200 } = {}) => {
  const read = (raw, fallback, max, name) => {
    if (raw === undefined) return fallback;
    if (!/^\d{1,9}$/.test(String(raw))) throw badRequest(`Invalid ${name}`);
    return Math.min(Number(raw), max);
  };
  const limit = read(query.limit, defaultLimit, maxLimit, 'limit');
  if (limit < 1) throw badRequest('Invalid limit');
  return { limit, offset: read(query.offset, 0, MAX_INT, 'offset') };
};

// Returns undefined when the field is absent, null when explicitly null.
export const optionalString = (body, key, max) => {
  const value = body[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || value.length > max) throw badRequest(`Invalid ${key}`);
  return value;
};

export const requiredString = (body, key, max) => {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw badRequest(`Invalid ${key}`);
  }
  return value.trim();
};

export const optionalNumber = (body, key, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) => {
  const value = body[key];
  if (value === undefined || value === null) return value;
  const belowMin = exclusiveMin ? value <= min : value < min;
  if (typeof value !== 'number' || !Number.isFinite(value) || belowMin || value > max) {
    throw badRequest(`Invalid ${key}`);
  }
  return value;
};

export const requiredNumber = (body, key, range) => {
  const value = optionalNumber(body, key, range);
  if (value == null) throw badRequest(`Invalid ${key}`);
  return value;
};

export const optionalDate = (body, key) => {
  const value = body[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw badRequest(`Invalid ${key}`);
  }
  return value;
};

export const requireBody = (req, _res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(badRequest('Request body must be a JSON object'));
  }
  next();
};

// PostgreSQL error codes that are the caller's fault rather than ours.
const PG_CLIENT_ERRORS = {
  '23505': [409, 'Record already exists'],
  '23503': [400, 'Referenced record does not exist'],
  '23502': [400, 'Missing required field'],
  '23514': [400, 'Value out of range'],
  '22001': [400, 'Value too long'],
  '22003': [400, 'Value out of range'],
  '22007': [400, 'Invalid date'],
  '22008': [400, 'Invalid date'],
  '22P02': [400, 'Invalid value']
};

export const notFoundHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

// Never echo internal error text (SQL, stack traces) back to clients.
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  const mapped = PG_CLIENT_ERRORS[err?.code];
  if (mapped) {
    return res.status(mapped[0]).json({ error: mapped[1] });
  }
  console.error(err?.stack || err);
  res.status(500).json({ error: 'Internal server error' });
};
