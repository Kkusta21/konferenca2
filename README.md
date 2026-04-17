# Konferenca Attendance System — Project Documentation

## 🌐 Live URLs
| Page | URL | Share With |
|------|-----|------------|
| Registration | `konferenca2.vercel.app/regjistrohu.html` | All attendees |
| Scanner | `konferenca2.vercel.app/skaner.html` | Room admins |
| Admin Panel | `konferenca2.vercel.app/admin.html` | Only you |

**Admin password:** `20262026`

---

## 🏗️ How The System Works

1. **Attendee registers** at `regjistrohu.html` → enters name + email
2. A unique code `KNF-XXXXXXXX` is generated and saved to Firebase
3. An email with the QR code is sent via Gmail through Vercel
4. **At the conference**, room admins open `skaner.html`
5. Admin selects which event they are scanning for
6. Attendee shows QR or types code → admin scans it
7. System marks attendee as checked in for that event
8. Same code works for all events but can't be used twice for the same event

---

## 🔧 Tech Stack
- **Firebase Firestore** — real-time database, stores events and attendees
- **Vercel** — hosts the HTML files and runs the email API function
- **Gmail** — sends QR code emails via Nodemailer
- **GitHub** — stores the code (repo: `konferenca2`)

---

## 🔑 Credentials & Config

### Firebase
- Project: `konferenca`
- Project ID: `konferenca`
- Auth Domain: `konferenca.firebaseapp.com`
- API Key: stored in HTML files (public Firebase key, safe to expose)

### Vercel Project
- Project name: `konferenca2`
- GitHub repo: `Kkusta21/konferenca2`

### Vercel Environment Variables
| Name | Description |
|------|-------------|
| `GMAIL_USER` | `Kristjankusta11@gmail.com` |
| `GMAIL_PASS` | Gmail App Password (16 chars, stored securely in Vercel) |
| `SENDER_NAME` | `Konferenca` |

### EmailJS (not in use — switched to Gmail)
- Service ID: `service_w5tnq4q`
- Template ID: `template_yqttemf`

---

## 📁 File Structure (GitHub repo)
```
konferenca2/
├── api/
│   └── send-email.js       ← Vercel serverless function, sends emails via Gmail
├── admin.html              ← Password-protected admin panel
├── regjistrohu.html        ← Public registration page for attendees
├── skaner.html             ← Scanner page for room admins
├── package.json            ← Node.js deps (nodemailer)
└── vercel.json             ← Vercel routing config
```

---

## 👤 How To Use — Admin Panel
1. Go to `konferenca2.vercel.app/admin.html`
2. Enter password `20262026`
3. **Evente tab** → create events (name, location, date, time)
4. **Pjesëmarrës tab** → manually register attendees if needed
5. **Verifiko Kod tab** → verify a code exists + manually check in
6. **Raporte tab** → see attendance stats per event

---

## 📲 How To Use — Scanner
1. Go to `konferenca2.vercel.app/skaner.html`
2. Select the event you are scanning for
3. Type or scan the attendee code (e.g. `KNF-AB3X9Y2Z`)
4. Press Enter or click Pranoj
5. ✅ Green = checked in successfully
6. ⚠️ Yellow = already checked in for this event
7. ❌ Red = invalid code

---

## 🔒 Security
- Admin panel protected by password
- Each QR code is unique per attendee
- Codes can't be reused for the same event (fraud prevention)
- Gmail App Password stored only in Vercel environment variables
- Firebase API key is safe to be public (read/write rules can be tightened later)

---

## 💰 Cost Breakdown (5,000 attendees)
| Service | Usage | Cost |
|---------|-------|------|
| Firebase | Well within free tier | $0/month |
| Vercel | Well within free tier | $0/month |
| Gmail | 500 emails/day limit | $0/month |
| **Total** | | **$0/month** |

⚠️ If 5,000 people register within 10 days, Gmail's 500/day limit is fine.
If everyone registers same day, upgrade to SendGrid ($19.95/month for 50k emails).

---

## 🛠️ How To Make Changes

### Add a new event
→ Admin panel → Evente tab → fill form → Shto Event

### Change admin password
→ Edit `admin.html` in GitHub → find `const ADMIN_PASS = "20262026"` → change it → commit

### Change sender name
→ Vercel → Settings → Environment Variables → edit `SENDER_NAME`

### Update Gmail password
→ Vercel → Settings → Environment Variables → edit `GMAIL_PASS` → Redeploy

---

## 🚨 Troubleshooting

**Emails not sending:**
- Check Vercel logs for errors
- Verify `GMAIL_USER` and `GMAIL_PASS` are correct in Vercel env vars
- Make sure Gmail App Password is still active at myaccount.google.com

**Scanner not loading events:**
- Check Firebase Firestore rules allow read/write
- Make sure events were created in Admin panel first

**QR code shows but no email received:**
- Check spam folder
- Check Vercel function logs for 500 errors
- Gmail daily limit may have been reached (500/day)

**Firebase permission denied:**
- Go to Firebase Console → Firestore → Rules
- Make sure rules allow read/write in test mode
