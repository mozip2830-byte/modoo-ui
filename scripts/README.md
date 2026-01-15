# Scripts (DEV-ONLY)

Admin scripts for local development. **Do NOT use in production.**

## Prerequisites

1. Install `firebase-admin`:
   ```powershell
   pnpm add -w firebase-admin
   ```

2. Get a Service Account key:
   - Go to [Firebase Console](https://console.firebase.google.com/) → Project Settings → Service accounts
   - Click **"Generate new private key"**
   - Save the JSON file (e.g., `C:\keys\modoo-dev-serviceAccount.json`)
   - **⚠️ NEVER commit this file to git!**

3. Set the credentials environment variable:
   ```powershell
   # Windows PowerShell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\modoo-dev-serviceAccount.json"
   ```
   ```bash
   # macOS/Linux
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
   ```

---

## setAdminClaim.mjs

Set `{ admin: true }` custom claim on a Firebase user for admin console access.

### Usage

```powershell
# Set admin claim
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\modoo-dev-serviceAccount.json"
node scripts/setAdminClaim.mjs --uid <UID>

# Remove admin claim
node scripts/setAdminClaim.mjs --uid <UID> --remove
```

### After Running

1. In admin-web, click **"로그아웃"** then sign in again
   - OR click **"토큰 새로고침"** button on the main page
2. Claims will now show `admin: true`
3. You can access the `/admin` page

---

## approvePartner.mjs

Approve a partner user (bypasses Firestore rules).

```powershell
# With service account
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\modoo-dev-serviceAccount.json"
node scripts/approvePartner.mjs --uid <UID>

# With custom grade
node scripts/approvePartner.mjs --uid <UID> --grade "프리미엄회원"
```

### Fields Updated

| Field | Value |
|-------|-------|
| `businessVerified` | `true` |
| `verificationStatus` | `"승인"` |
| `grade` | `"정회원"` (or custom) |
| `approvedAt` | `serverTimestamp()` |
| `verificationUpdatedAt` | `serverTimestamp()` |
