import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import pool from '@/lib/db';

export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    const email   = decoded.email?.toLowerCase();
    if (!email) return Response.json({ error: 'No email on token' }, { status: 401 });

    // Look up by email — user must be pre-approved by admin
    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND active = 1', [email]
    ) as any;

    if (!user) return Response.json({ error: 'Not authorized' }, { status: 403 });

    // Backfill firebase_uid on first sign-in
    if (!user.firebase_uid || user.firebase_uid !== decoded.uid) {
      await pool.query('UPDATE users SET firebase_uid = ? WHERE id = ?', [decoded.uid, user.id]);
    }

    return Response.json({
      id:    user.id,
      email: user.email,
      name:  user.full_name,
      role:  user.role,
    });
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }
}
