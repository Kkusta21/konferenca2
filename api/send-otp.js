import nodemailer from 'nodemailer';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initFirebase() {
  if (getApps().length) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

// Public image URL served from the GitHub repo
const LOGO_URL   = 'https://raw.githubusercontent.com/Kkusta21/konferenca2/main/assets/logo.jpg';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Emri dhe email-i janë të detyrueshëm' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Format i pavlefshëm email-i' });
  }

  try {
    initFirebase();
    const db = getFirestore();

    // 1. Already registered?
    const attSnap = await db.collection('attendees').where('email', '==', email).limit(1).get();
    if (!attSnap.empty) {
      return res.status(409).json({ error: 'Ky email është regjistruar tashmë.' });
    }

    // 2. Rate limit (1 OTP / email / 60s)
    const otpSnap = await db.collection('otps').where('email', '==', email).orderBy('createdAt', 'desc').limit(1).get();
    if (!otpSnap.empty) {
      const last = otpSnap.docs[0].data();
      const lastMs = last.createdAt?.toMillis?.() || 0;
      const ageSec = (Date.now() - lastMs) / 1000;
      if (ageSec < 60) {
        return res.status(429).json({ error: `Prisni ${Math.ceil(60 - ageSec)} sekonda para se të kërkoni kodin përsëri.` });
      }
    }

    // 3. New code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // 4. Invalidate old unused OTPs for this email
    const oldOtps = await db.collection('otps').where('email', '==', email).where('used', '==', false).get();
    const batch = db.batch();
    oldOtps.forEach(d => batch.update(d.ref, { used: true, invalidated: true }));
    await batch.commit();

    // 5. Save new OTP
    await db.collection('otps').add({
      email, name, code,
      attempts: 0, used: false,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    // 6. Send branded email
    const GMAIL_USER  = process.env.GMAIL_USER;
    const GMAIL_PASS  = process.env.GMAIL_PASS;
    const SENDER_NAME = process.env.SENDER_NAME || 'KKSHM 2026';

    const html = `<!DOCTYPE html>
<html lang="sq">
<head><meta charset="UTF-8"><title>Kodi i Verifikimit · KKSHM 2026</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.05);">

        <!-- Red top bar + Logo + title -->
        <tr><td style="background:#c8102e;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 10px;text-align:center;border-bottom:2px solid #c8102e;">
          <img src="${LOGO_URL}" alt="KKSHM" width="64" height="64" style="width:64px;height:64px;border-radius:50%;border:2px solid #c8102e;padding:2px;background:#fff;">
          <p style="margin:10px 0 4px;color:#c8102e;font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;font-weight:600;">Viti i 14-të</p>
          <h1 style="margin:0 0 6px;font-family:'Oswald','Helvetica Neue',Arial,sans-serif;font-size:1.3rem;font-weight:700;text-transform:uppercase;line-height:1.2;letter-spacing:0.5px;">
            Konferenca Kombëtare<br>e Shkencave Mjekësore
          </h1>
          <p style="margin:6px 0 22px;color:#6b7280;font-size:0.82rem;">Tiranë · 8 – 10 Maj 2026</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0 0 8px;font-size:1rem;">Përshëndetje, <strong>${name}</strong>,</p>
          <p style="margin:0 0 20px;color:#6b7280;font-size:0.92rem;line-height:1.6;">
            Për të përfunduar regjistrimin tënd në <strong style="color:#1a1a1a;">KKSHM 2026</strong>, shkruaj kodin 6-shifror më poshtë në faqen e regjistrimit. Kodi skadon pas 10 minutash.
          </p>

          <!-- OTP box -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
            <div style="background:#ffe5ea;border:2px solid #c8102e;border-radius:8px;padding:22px 18px;margin:4px 0 24px;display:inline-block;min-width:260px;">
              <p style="margin:0 0 6px;font-size:0.7rem;color:#6b7280;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;">Kodi juaj</p>
              <p style="margin:0;font-family:'Courier New',monospace;font-size:2.4rem;letter-spacing:0.35em;color:#c8102e;font-weight:700;line-height:1;">${code}</p>
            </div>
          </td></tr></table>

          <p style="margin:0 0 20px;color:#9ca3af;font-size:0.78rem;text-align:center;line-height:1.7;">
            ⚠️ Nëse nuk e keni kërkuar këtë kod, injorojeni këtë email.<br>
            Mos e ndani kodin me askënd.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:0.72rem;line-height:1.6;">
            © 2026 KKSHM · Konferenca Kombëtare e Shkencave Mjekësore<br>
            Tirana International Hotel &amp; Conference Center
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
      subject: `🔐 Kodi i verifikimit: ${code} — KKSHM 2026`,
      html,
    });

    return res.status(200).json({ success: true, message: 'Kodi u dërgua në email-in tuaj.' });
  } catch (e) {
    console.error('send-otp error:', e);
    return res.status(500).json({ error: 'Gabim serveri: ' + e.message });
  }
}
