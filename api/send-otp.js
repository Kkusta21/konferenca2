import nodemailer from 'nodemailer';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin once (reuses across invocations)
function initFirebase() {
  if (getApps().length) return;
  // Use Application Default Credentials via service account JSON in env var
  // OR fall back to REST-style client using the project ID (for simplicity we use service account)
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Emri dhe email-i janë të detyrueshëm' });

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Format i pavlefshëm email-i' });
  }

  try {
    initFirebase();
    const db = getFirestore();

    // 1. Check if email is already a registered attendee
    const attSnap = await db.collection('attendees').where('email', '==', email).limit(1).get();
    if (!attSnap.empty) {
      return res.status(409).json({ error: 'Ky email është regjistruar tashmë.' });
    }

    // 2. Rate limit: 1 OTP request per email per 60 seconds
    const otpSnap = await db.collection('otps').where('email', '==', email).orderBy('createdAt', 'desc').limit(1).get();
    if (!otpSnap.empty) {
      const last = otpSnap.docs[0].data();
      const lastMs = last.createdAt?.toMillis?.() || 0;
      const ageSec = (Date.now() - lastMs) / 1000;
      if (ageSec < 60) {
        return res.status(429).json({ error: `Prisni ${Math.ceil(60 - ageSec)} sekonda para se të kërkoni kodin përsëri.` });
      }
    }

    // 3. Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    // 4. Invalidate any previous unused OTPs for this email
    const oldOtps = await db.collection('otps').where('email', '==', email).where('used', '==', false).get();
    const batch = db.batch();
    oldOtps.forEach(d => batch.update(d.ref, { used: true, invalidated: true }));
    await batch.commit();

    // 5. Save new OTP
    await db.collection('otps').add({
      email,
      name,
      code,
      attempts: 0,
      used: false,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    // 6. Send email with OTP
    const GMAIL_USER  = process.env.GMAIL_USER;
    const GMAIL_PASS  = process.env.GMAIL_PASS;
    const SENDER_NAME = process.env.SENDER_NAME || 'Konferenca';

    const html = `<div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#00e5b4,#00bcd4);padding:28px;text-align:center">
        <h1 style="margin:0;font-size:1.4rem;color:#000">🔐 Kodi i Verifikimit</h1>
        <p style="margin:6px 0 0;color:#000;opacity:0.75">${SENDER_NAME}</p>
      </div>
      <div style="padding:30px">
        <p style="margin:0 0 8px">Përshëndetje, <strong>${name}</strong>!</p>
        <p style="color:#9999bb;font-size:0.88rem;margin:0 0 22px">Përdorni kodin më poshtë për të verifikuar email-in tuaj. Kodi skadon pas 10 minutash.</p>
        <div style="background:#1c1c28;border:2px solid #00e5b4;border-radius:8px;padding:22px;text-align:center;margin-bottom:22px">
          <p style="margin:0;font-size:0.7rem;color:#9999bb;text-transform:uppercase;letter-spacing:0.12em">Kodi juaj</p>
          <p style="margin:10px 0 0;font-family:'Courier New',monospace;font-size:2.4rem;letter-spacing:0.4em;color:#00e5b4;font-weight:bold">${code}</p>
        </div>
        <p style="color:#6b6b8a;font-size:0.75rem;text-align:center;line-height:1.6">
          ⚠️ Nëse nuk e keni kërkuar këtë kod, injorojeni këtë email.<br>
          Mos e ndani kodin me askënd.
        </p>
      </div>
    </div>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
      to: email,
      subject: `🔐 Kodi i Verifikimit: ${code}`,
      html,
    });

    return res.status(200).json({ success: true, message: 'Kodi u dërgua në email-in tuaj.' });
  } catch (e) {
    console.error('send-otp error:', e);
    return res.status(500).json({ error: 'Gabim serveri: ' + e.message });
  }
}
