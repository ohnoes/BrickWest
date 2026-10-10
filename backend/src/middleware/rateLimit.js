// Minimal in-memory fixed-window rate limiter. Good enough for a single API
// instance; swap for a shared store if the API is ever scaled horizontally.
export const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 30 } = {}) => {
  const hits = new Map();

  const sweep = now => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) sweep(now);

    const key = req.ip || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    next();
  };
};
