import 'dotenv/config';

export const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-secret-key-change-in-production') {
  throw new Error('Set JWT_SECRET to a unique secret before starting the API');
}
