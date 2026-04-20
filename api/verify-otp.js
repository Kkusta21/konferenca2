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

const LOGO_URL   = 'https://raw.githubusercontent.com/Kkusta21/konferenca2/main/assets/logo.jpg';

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

    // 1. Latest unused OTP
    const snap = await db.collection('otps')
      .where('email', '==', email)
      .where('used', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ error: 'Asnjë kod aktiv. Kërkoni një kod të ri.' });

    const otpDoc = snap.docs[0];
    const otp = otpDoc.data();

    // 2. Expiry
    if (Date.now() > otp.expiresAt) {
      await otpDoc.ref.update({ used: true, expired: true });
      return res.status(410).json({ error: 'Kodi ka skaduar. Kërkoni një kod të ri.' });
    }

    // 3. Attempts
    const attempts = otp.attempts || 0;
    if (attempts >= 5) {
      await otpDoc.ref.update({ used: true, blocked: true });
      return res.status(429).json({ error: 'Shumë përpjekje të gabuara. Kërkoni një kod të ri.' });
    }

    // 4. Code match
    if (String(otp.code) !== String(code).trim()) {
      await otpDoc.ref.update({ attempts: attempts + 1 });
      const remaining = 5 - (attempts + 1);
      return res.status(401).json({ error: `Kod i gabuar. ${remaining} përpjekje të mbetura.` });
    }

    // 5. Double-check email not already registered
    const existing = await db.collection('attendees').where('email', '==', email).limit(1).get();
    if (!existing.empty) {
      await otpDoc.ref.update({ used: true });
      return res.status(409).json({ error: 'Ky email është regjistruar tashmë.' });
    }

    // 6. Unique attendee code
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
      name, email, code: attendeeCode,
      checkedInEvents: [],
      emailVerified: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 8. Mark OTP used
    await otpDoc.ref.update({ used: true, verifiedAt: FieldValue.serverTimestamp() });

    // 9. Send QR code email
    const GMAIL_USER  = process.env.GMAIL_USER;
    const GMAIL_PASS  = process.env.GMAIL_PASS;
    const SENDER_NAME = process.env.SENDER_NAME || 'KKSHM 2026';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(attendeeCode)}`;

    const html = `<!DOCTYPE html>
<html lang="sq">
<head><meta charset="UTF-8"><title>Karta Juaj e Hyrjes · KKSHM 2026</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.05);">

        <!-- Red top bar + Identity -->
        <tr><td style="background:#c8102e;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 10px;text-align:center;border-bottom:2px solid #c8102e;">
          <img src="${LOGO_URL}" alt="KKSHM" width="64" height="64" style="width:64px;height:64px;border-radius:50%;border:2px solid #c8102e;padding:2px;background:#fff;">
          <p style="margin:10px 0 4px;color:#c8102e;font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">Viti i 14-të</p>
          <h1 style="margin:0 0 6px;font-family:'Oswald','Helvetica Neue',Arial,sans-serif;font-size:1.3rem;font-weight:700;text-transform:uppercase;line-height:1.2;letter-spacing:0.5px;">
            Konferenca Kombëtare<br>e Shkencave Mjekësore
          </h1>
          <p style="margin:6px 0 22px;color:#6b7280;font-size:0.82rem;">Tiranë · 8 – 10 Maj 2026</p>
        </td></tr>

        <!-- Welcome -->
        <tr><td style="padding:28px 32px 4px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:#c8102e;color:#fff;font-size:2rem;line-height:56px;margin-bottom:14px;">✓</div>
          <h2 style="margin:0 0 6px;font-family:'Oswald','Helvetica Neue',Arial,sans-serif;font-size:1.5rem;font-weight:700;color:#c8102e;text-transform:uppercase;">Karta Juaj e Hyrjes</h2>
          <p style="margin:0 0 4px;font-size:1rem;"><strong>${name}</strong></p>
          <p style="margin:0 0 22px;color:#6b7280;font-size:0.88rem;line-height:1.6;">
            Regjistrimi yt u krye me sukses.<br>
            Ky kod QR është kartela juaj personale e hyrjes për gjithë konferencën.
          </p>
        </td></tr>

        <!-- QR -->
        <tr><td align="center" style="padding:4px 32px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>
            <div style="background:#fff;padding:14px;border:2px solid #c8102e;border-radius:8px;display:inline-block;">
              <img src="${qrUrl}" alt="QR Code" width="220" height="220" style="width:220px;height:220px;display:block;">
            </div>
          </td></tr></table>
        </td></tr>

        <!-- Code -->
        <tr><td align="center" style="padding:4px 32px 24px;">
          <div style="background:#ffe5ea;border:1px solid rgba(200,16,46,0.3);border-radius:6px;padding:12px 20px;display:inline-block;">
            <p style="margin:0 0 4px;font-size:0.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.15em;font-weight:600;">Kodi juaj unik</p>
            <p style="margin:0;font-family:'Courier New',monospace;font-size:1.25rem;letter-spacing:0.15em;color:#c8102e;font-weight:700;">${attendeeCode}</p>
          </div>
        </td></tr>

        <!-- Instructions -->
        <tr><td style="padding:0 32px 28px;">
          <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:6px;padding:16px 18px;font-size:0.82rem;line-height:1.8;color:#374151;">
            <strong style="color:#1a1a1a;">Udhëzime të rëndësishme:</strong><br>
            📌 Mbajeni këtë email (ose bëni screenshot) gjatë gjithë konferencës.<br>
            ✅ Do të skanohet në hyrje të çdo seance.<br>
            🎫 Një kod për të gjitha eventet — nuk ka nevojë të regjistroheni përsëri.<br>
            ⚠️ Mos e ndani me të tjerët — kodi është personal.
          </div>
        </td></tr>

        <!-- Venue -->
        <tr><td style="padding:0 32px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;padding-top:18px;">
            <tr><td style="font-size:0.8rem;color:#6b7280;line-height:1.7;text-align:center;">
              <strong style="color:#1a1a1a;">📍 Vendi:</strong> Tirana International Hotel &amp; Conference Center<br>
              <strong style="color:#1a1a1a;">📅 Data:</strong> 8 – 10 Maj 2026
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:0.72rem;line-height:1.6;">
            © 2026 KKSHM · Konferenca Kombëtare e Shkencave Mjekësore
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
      to: email,
      subject: `🎫 Karta juaj e hyrjes — KKSHM 2026`,
      html,
    });

    return res.status(200).json({ success: true, code: attendeeCode, name });
  } catch (e) {
    console.error('verify-otp error:', e);
    return res.status(500).json({ error: 'Gabim serveri: ' + e.message });
  }
}
