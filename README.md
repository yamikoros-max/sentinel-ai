# 🛡️ SentinelAI — Open Behavioral Security for Your Domain

**SentinelAI** is an open-source behavioral security system that detects when a
legitimate user account is being misused — even when the attacker has the
correct username, password, and OTP.

Instead of only checking credentials, SentinelAI learns how each user normally
behaves (login hours, devices, networks, geography, file volumes, API rhythm,
resources touched) and scores every new session against that private archive
with an **Isolation Forest ensemble + rule-evidence engine**, returning a
0–100 risk score and a verdict your systems can act on:

| Risk | Verdict | Action |
| ---- | ----------------- | ------------------------------ |
| 0–29 | `allow` | Behavior matches the archive |
| 30–59 | `monitor` | Watch quietly, no friction |
| 60–79 | `challenge` | Step-up MFA verification |
| 80–100 | `block` | Freeze account, alert the SOC |

An optional **LLM Security Analyst** (OpenAI `gpt-4o-mini`) converts the
technical dossier into a plain-language incident memo for non-technical
reviewers.

---

## ✨ Multi-tenant by design

- **One organization per email domain.** Claim your domain with a work email
  (`you@acme.com` → org `acme.com`); you become the domain **admin**.
  Colleagues who sign up with the same email domain join automatically as
  **members**.
- **Role-based redaction.** Admins see full session detail — IPs, devices,
  locations, resource names, raw log lines. Members get a redacted view
  (`•.•.•.•`, `redacted`). The redaction is enforced **server-side**, in the
  query layer — members never receive the sensitive fields over the wire.
- **Hashed ingest keys.** API keys (`sai_…`) are shown once at mint time and
  stored only as SHA-256 hashes.
- **Live ingestion.** Stream session events to `POST /api/ingest` and get an
  immediate verdict back, so your gateway/SSO can act in real time.
- **Cold-start safe.** New users with thin history are scored evidence-only and
  **never auto-blocked** (verdict capped at `monitor`) until enough benign
  history exists to trust the ensemble.

---

## 🚀 Quick start (self-hosting)

```bash
bun install
bun convex dev --once   # generate backend types + push schema
bun run dev             # start the app
```

Sign in, then open **`/onboarding`** to claim your organization's domain.

### Mint an ingest key

1. Open the Watch Room → **Domain** (settings).
2. Click **Mint new key** — copy it immediately (shown once).
3. Use the copied snippet or the example below.

### Stream a session event

```bash
curl -X POST https://YOUR-APP-URL/api/ingest \
  -H "Authorization: Bearer sai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "u_10293",
    "ts": 1757900000000,
    "ip": "203.0.113.9",
    "city": "Chennai",
    "country": "India",
    "lat": 13.08, "lon": 80.27,
    "device": "MacBook Pro",
    "browser": "Chrome 139",
    "fileDownloads": 12,
    "fileUploads": 1,
    "apiCalls": 640,
    "sensitiveResources": [],
    "privilegedActions": [],
    "authPassed": ["password", "otp"],
    "notes": ["login from web app"]
  }'
```

Response:

```json
{
  "ok": true,
  "sessionId": "j57…",
  "score": 96,
  "verdict": "block",
  "action": "block",
  "headline": "Critical — Block + Alert (96/100)",
  "coldStart": false
}
```

Act on `action` in your own systems: allow the request, force an MFA
challenge, or deny and page someone.

### Fire test events (no code needed)

In **Domain → Live Test Console**, an admin can send a scripted *benign pulse*
or an *attack pulse* (3 a.m. login from Tor, 1,847 downloads, first-time
payroll access…) through the real scoring pipeline and watch it land in the
live ledger.

---

## 🧠 How scoring works

```
Session event
   ↓
Feature extraction (11 behavioral features)
   ├── hour-of-day (sin/cos, user's home timezone)
   ├── device & network novelty
   ├── geo distance + impossible-travel speed (haversine)
   ├── download / API ratios vs personal ceilings
   ├── first-time sensitive resources & privileged commands
   ↓
Per-user Isolation Forest (trained on benign history only)
        + Rule evidence ledger (weighted factors)
   ↓
Calibration → 0–100 risk score → verdict dispatch
   ↓
LLM Security Analyst memo (optional) → SOC dashboard
```

Key properties:

- **One-class learning.** Forests are trained per-user on *benign* history
  only, so attack sessions never pollute the archive.
- **Relative anomaly.** Scores are normalized against the worst session in the
  user's own benign archive, so a quiet user and a power user are judged by
  their own norms.
- **Explainable.** Every score ships with a factor ledger: which rules fired,
  their weights, and the evidence ("03:15 IST vs usual 09:00–19:00",
  "6,620 km from the prior session with only 10.6 h between logins").

Calibrate it yourself:

```bash
bun run src/lib/sentinel/calibrate.ts
```

---

## 🔒 Security model

| Layer | Guarantee |
| --- | --- |
| Ingest auth | Bearer `sai_…` key → SHA-256 lookup; raw keys never stored |
| Tenant isolation | Every query/mutation filters by org membership server-side |
| Detail redaction | Admin-only fields (IP, device, geo, resources, notes) are stripped in the query, not hidden in the UI |
| Key visibility | Minted key shown exactly once; only hash + preview persisted |
| Cold start | Thin archives cap verdicts at `monitor` — no false lockouts |

---

## 🗂️ Project layout

```
src/
├── convex/
│   ├── orgs.ts          # orgs, keys, live ingestion, role-aware queries, LLM memo
│   ├── http.ts          # POST /api/ingest (public, key-authenticated)
│   ├── sentinel.ts      # demo archive + demo analyst
│   └── schema.ts        # organizations, orgMembers, ingestKeys, live sessions
├── lib/sentinel/
│   ├── engine.ts        # feature extraction, Isolation Forest scoring, verdicts
│   ├── isoforest.ts     # Isolation Forest implementation
│   ├── baselines.ts     # per-user behavioral baselines
│   ├── geo.ts           # haversine + implied travel speed
│   └── calibrate.ts     # calibration/sanity harness
├── pages/
│   ├── Landing.tsx      # vintage archive-themed landing
│   ├── Onboarding.tsx   # claim your domain
│   ├── Dashboard.tsx    # Watch Room (live feed + demo archive)
│   └── OrgSettings.tsx  # keys, integration snippet, test console, members
└── components/sentinel/ # RiskDial, SessionTimeline, MemoCard
```

## 🧩 Integrating from your website

Minimal browser snippet (fire on every login/session start):

```js
await fetch("https://YOUR-APP-URL/api/ingest", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + INGEST_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    user: userId,            // your stable user id
    ts: Date.now(),
    ip: clientIp,            // from your edge/server
    city, country,           // optional, from your geoip
    device: navigator.platform,
    browser: userAgent,
    fileDownloads: 0,
    fileUploads: 0,
    apiCalls: 1,
  }),
})
  .then((r) => r.json())
  .then(({ action }) => {
    if (action === "block") denySession();
    else if (action === "challenge") requireMfa();
  });
```

> Keep the ingest key server-side if you can (edge function / backend proxy).
> The key only allows *writing* scored events — it cannot read anything.

## 📄 License

MIT — see [LICENSE](./LICENSE).
