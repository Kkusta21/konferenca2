import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, code } = req.body;
  if (!name || !email || !code) return res.status(400).json({ error: 'Missing fields' });

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;
  const SENDER_NAME = process.env.SENDER_NAME || 'Konferenca';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(code)}`;

  const html = `<div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#00e5b4,#00bcd4);padding:32px;text-align:center"><h1 style="margin:0;font-size:1.6rem;color:#000">🎫 Karta Juaj e Hyrjes</h1><p style="margin:8px 0 0;color:#000;opacity:0.7">${SENDER_NAME}</p></div><div style="padding:32px"><p style="margin:0 0 8px">Përshëndetje, <strong>${name}</strong>!</p><p style="color:#9999bb;font-size:0.88rem;margin:0 0 24px">Ky kod QR është kartela juaj e hyrjes për të gjitha eventet e konferencës.</p><div style="text-align:center;margin-bottom:24px"><img src="${qrUrl}" style="width:220px;height:220px;border-radius:8px;border:8px solid #fff"/></div><div style="background:#1c1c28;border:1px solid #00e5b4;border-radius:6px;padding:12px;text-align:center;margin-bottom:24px"><p style="margin:0;font-size:0.72rem;color:#9999bb;text-transform:uppercase;letter-spacing:0.1em">Kodi juaj unik</p><p style="margin:6px 0 0;font-family:monospace;font-size:1.3rem;letter-spacing:0.15em;color:#00e5b4">${code}</p></div><p style="color:#6b6b8a;font-size:0.75rem;text-align:center">⚠️ Ky kod është personal. Mos e ndani me të tjerët.</p></div></div>`;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });
    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
      to: email,
      subject: `🎫 Karta Juaj e Hyrjes — ${SENDER_NAME}`,
      html
    });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
