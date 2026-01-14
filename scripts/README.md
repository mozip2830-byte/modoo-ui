# Scripts (DEV-ONLY)

Admin scripts for local development. **Do NOT use in production.**

## Prerequisites

1. Install `firebase-admin`:
   ```powershell
   pnpm add -w firebase-admin
   ```

2. Set up credentials (one of):
   - **ADC**: `gcloud auth application-default login`
   - **Service Account**: Set `GOOGLE_APPLICATION_CREDENTIALS` env var

## approvePartner.mjs

Approve a partner user (bypasses Firestore rules).

```powershell
# With service account
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\modoo-dev-serviceAccount.json"
node scripts/approvePartner.mjs --uid <UID>

# With custom grade
node scripts/approvePartner.mjs --uid <UID> --grade "프리미엄회원"
```

### Fields Updated

| Field | Value |
|-------|-------|
| `businessVerified` | `true` |
| `verificationStatus` | `"승인완료"` |
| `grade` | `"정회원"` (or custom) |
| `approvedAt` | `serverTimestamp()` |
| `verificationUpdatedAt` | `serverTimestamp()` |
