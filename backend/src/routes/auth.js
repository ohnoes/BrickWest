import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { query } from '../db.js';
import { JWT_SECRET } from '../config.js';
import { HttpError, badRequest, requireBody, requiredString, wrap } from '../http.js';
import { rateLimit } from '../middleware/rateLimit.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt only hashes the first 72 bytes, so longer passwords would be silently truncated.
const MAX_PASSWORD_BYTES = 72;

// Compared against when the account does not exist, so response time does not
// reveal which emails are registered.
const DUMMY_HASH = bcryptjs.hashSync(randomBytes(16).toString('hex'), 10);

const normalizeEmail = value => {
  if (typeof value !== 'string') throw badRequest('Invalid email');
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !EMAIL_PATTERN.test(email)) throw badRequest('Invalid email');
  return email;
};

const sameSecret = (a, b) => {
  const digest = value => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
};

const signToken = user => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '7d' }
);

export const createAuthRouter = ({
  registrationCode = process.env.REGISTRATION_CODE || '',
  rateLimitOptions = {
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30
  }
} = {}) => {
  const router = express.Router();
  router.use(rateLimit(rateLimitOptions));
  router.use(requireBody);

  router.post('/register', wrap(async (req, res) => {
    const { password } = req.body;
    if (req.body.email == null || password == null || req.body.name == null) {
      throw badRequest('Missing required fields');
    }
    // When REGISTRATION_CODE is set, only people who know it can create accounts.
    if (registrationCode && !sameSecret(req.body.registration_code ?? '', registrationCode)) {
      throw new HttpError(403, 'A valid registration code is required');
    }

    const email = normalizeEmail(req.body.email);
    const name = requiredString(req.body, 'name', 255);
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw badRequest(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    let result;
    try {
      // Public registration always creates a brewer; the role is never client-supplied.
      result = await query(
        `INSERT INTO users (email, password_hash, name, role)
         SELECT $1::text, $2, $3, $4
         WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1::text)
         RETURNING id, email, name, role`,
        [email, hashedPassword, name, 'brewer']
      );
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Email already exists');
      throw err;
    }
    if (result.rows.length === 0) throw new HttpError(409, 'Email already exists');

    const user = result.rows[0];
    res.status(201).json({ user, token: signToken(user) });
  }));

  router.post('/login', wrap(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw badRequest('Missing credentials');
    }

    const result = await query(
      `SELECT id, email, password_hash, name, role, active
       FROM users WHERE lower(email) = $1
       ORDER BY id LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    const passwordMatch = await bcryptjs.compare(password, user?.password_hash || DUMMY_HASH);

    if (!user || !passwordMatch || user.active === false) {
      throw new HttpError(401, 'Invalid credentials');
    }

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token: signToken(user)
    });
  }));

  return router;
};

export default createAuthRouter();
