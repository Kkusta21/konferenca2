import nodemailer from 'nodemailer';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initFirebase() {
  if (getApps().length) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

function generateAttendeeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'KNF-';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email dhe kodi janë të detyrueshëm' });

  try {
    initFirebase();
    const db = getFirestore();

    // 1. Find the latest un-used OTP for this email
    const snap = await db.collection('otps')
      .where('email', '==', email)
      .where('used', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Asnjë kod aktiv. Kërkoni një kod të ri.' });
    }

    const otpDoc = snap.docs[0];
    const otp = otpDoc.data();

    // 2. Check expiry
    if (Date.now() > otp.expiresAt) {
      await otpDoc.ref.update({ used: true, expired: true });
      return res.status(410).json({ error: 'Kodi ka skaduar. Kërkoni një kod të ri.' });
    }

    // 3. Check attempts
    const attempts = otp.attempts || 0;
    if (attempts >= 5) {
      await otpDoc.ref.update({ used: true, blocked: true });
      return res.status(429).json({ error: 'Shumë përpjekje të gabuara. Kërkoni një kod të ri.' });
    }

    // 4. Check code match
    if (String(otp.code) !== String(code).trim()) {
      await otpDoc.ref.update({ attempts: attempts + 1 });
      const remaining = 5 - (attempts + 1);
      return res.status(401).json({ error: `Kod i gabuar. ${remaining} përpjekje të mbetura.` });
    }

    // 5. Double-check email is not already registered (race condition guard)
    const existing = await db.collection('attendees').where('email', '==', email).limit(1).get();
    if (!existing.empty) {
      await otpDoc.ref.update({ used: true });
      return res.status(409).json({ error: 'Ky email është regjistruar tashmë.' });
    }

    // 6. Generate unique attendee code (retry a few times on collision)
    let attendeeCode = '';
    for (let i = 0; i < 5; i++) {
      const candidate = generateAttendeeCode();
      const clash = await db.collection('attendees').where('code', '==', candidate).limit(1).get();
      if (clash.empty) { attendeeCode = candidate; break; }
    }
    if (!attendeeCode) return res.status(500).json({ error: 'Nuk u gjenerua kod unik. Provo përsëri.' });

    // 7. Create attendee
    const name = otp.name || 'Pjesëmarrës';
    await db.collection('attendees').add({
      name,
      email,
      code: attendeeCode,
      checkedInEvents: [],
      emailVerified: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 8. Mark OTP as used
    await otpDoc.ref.update({ used: true, verifiedAt: FieldValue.serverTimestamp() });

    // 9. Send the QR code email
    const GMAIL_USER  = process.env.GMAIL_USER;
    const GMAIL_PASS  = process.env.GMAIL_PASS;
    const SENDER_NAME = process.env.SENDER_NAME || 'Konferenca';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(attendeeCode)}`;

    const html = `<div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#00e5b4,#00bcd4);padding:32px;text-align:center"><h1 style="margin:0;font-size:1.6rem;color:#000">🎫 Karta Juaj e Hyrjes</h1><p style="margin:8px 0 0;color:#000;opacity:0.7">${SENDER_NAME}</p></div><div style="padding:32px"><p style="margin:0 0 8px">Përshëndetje, <strong>${name}</strong>!</p><p style="color:#9999bb;font-size:0.88rem;margin:0 0 24px">Ky kod QR është kartela juaj e hyrjes për të gjitha eventet e konferencës.</p><div style="text-align:center;margin-bottom:24px"><img src="${qrUrl}" style="width:220px;height:220px;border-radius:8px;border:8px solid #fff"/></div><div style="background:#1c1c28;border:1px solid #00e5b4;border-radius:6px;padding:12px;text-align:center;margin-bottom:24px"><p style="margin:0;font-size:0.72rem;color:#9999bb;text-transform:uppercase;letter-spacing:0.1em">Kodi juaj unik</p><p style="margin:6px 0 0;font-family:monospace;font-size:1.3rem;letter-spacing:0.15em;color:#00e5b4">${attendeeCode}</p></div><p style="color:#6b6b8a;font-size:0.75rem;text-align:center">⚠️ Ky kod është personal. Mos e ndani me të tjerët.</p></div></div>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
      to: email,
      subject: `🎫 Karta Juaj e Hyrjes — ${SENDER_NAME}`,
      html,
    });

    return res.status(200).json({ success: true, code: attendeeCode, name });
  } catch (e) {
    console.error('verify-otp error:', e);
    return res.status(500).json({ error: 'Gabim serveri: ' + e.message });
  }
}
