# Testing Whistle on Your Phone

This guide explains how to test the app on a real device while running
the dev server locally.

---

## Prerequisites

- Node 18+ installed
- `ngrok` (or any tunnel) installed: `brew install ngrok`
- An ngrok account (free tier works): https://ngrok.com

---

## 1. Start the dev server

```bash
npm run dev
# Running on http://localhost:3000
```

## 2. Open a tunnel

In a second terminal:

```bash
ngrok http 3000
```

Copy the `Forwarding` URL, e.g. `https://abc123.ngrok-free.app`

---

## 3. Update your OAuth callback URLs

### Twitter / X Developer Portal
https://developer.twitter.com/en/portal/dashboard

Add to **Callback URLs**:
```
https://abc123.ngrok-free.app/api/auth/callback/twitter
```

Add to **Website URL**:
```
https://abc123.ngrok-free.app
```

### Meta for Developers (Instagram)
https://developers.facebook.com/apps

Go to **Facebook Login → Settings → Valid OAuth Redirect URIs**, add:
```
https://abc123.ngrok-free.app/api/auth/callback/instagram
```

---

## 4. Set NEXTAUTH_URL in your local env

In `.env.local`, update:

```env
NEXTAUTH_URL=https://abc123.ngrok-free.app
```

Restart the dev server after changing this.

---

## 5. Open on your phone

Navigate to `https://abc123.ngrok-free.app` in Safari or Chrome on your
device. Accept the ngrok interstitial if shown.

---

## 6. Manual poll trigger

From the **Connect** screen, tap **Poll Now** to run the pipeline against
live content immediately without waiting for the cron job.

---

## 7. Running the cron externally

For production, call the poll endpoint with your poll secret:

```bash
curl -X POST https://your-domain.com/api/poll \
  -H "x-poll-secret: <YOUR_NEXTAUTH_SECRET>"
```

Set up a cron job (e.g., Railway, Render cron, GitHub Actions schedule)
to hit this endpoint every 5–15 minutes.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| OAuth redirect mismatch | Confirm callback URL exactly matches ngrok URL in platform portals |
| `NEXTAUTH_URL` warnings | Restart dev server after `.env.local` change |
| 401 on `/api/poll` | Ensure `x-poll-secret` header matches `NEXTAUTH_SECRET` |
| Instagram token errors | Must be a Professional (Creator/Business) account |
| Twitter 429 | Rate limited — wait 15 min, then poll again |
