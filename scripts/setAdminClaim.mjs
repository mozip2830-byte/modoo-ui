#!/usr/bin/env node
/**
 * Set admin custom claim for a Firebase user
 *
 * This script sets { admin: true } custom claim on a user, granting them
 * access to the admin console's protected routes.
 *
 * Usage:
 *   node scripts/setAdminClaim.mjs --uid <UID>
 *
 * To remove admin claim:
 *   node scripts/setAdminClaim.mjs --uid <UID> --remove
 *
 * Credentials:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path:
 *   - Windows (PowerShell):
 *     $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccount.json"
 *   - macOS/Linux:
 *     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
 *
 * Example:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\modoo-ui\service-account-key.json"
 *   node scripts/setAdminClaim.mjs --uid abc123xyz
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { parseArgs } from "node:util";

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    uid: { type: "string", short: "u" },
    remove: { type: "boolean", short: "r", default: false },
  },
});

const uid = values.uid;
const remove = values.remove;

if (!uid) {
  console.error("Error: --uid <UID> is required");
  console.error("");
  console.error("Usage:");
  console.error("  node scripts/setAdminClaim.mjs --uid <UID>          # Set admin=true");
  console.error("  node scripts/setAdminClaim.mjs --uid <UID> --remove # Remove admin claim");
  console.error("");
  console.error("Before running, set GOOGLE_APPLICATION_CREDENTIALS:");
  console.error('  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\serviceAccount.json"');
  process.exit(1);
}

// Initialize Firebase Admin
try {
  initializeApp({
    credential: applicationDefault(),
    projectId: "modoo-dev-70c6b",
  });
} catch (err) {
  console.error("Failed to initialize Firebase Admin.");
  console.error("Ensure GOOGLE_APPLICATION_CREDENTIALS is set.");
  console.error("");
  console.error("To set credentials (PowerShell):");
  console.error('  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\serviceAccount.json"');
  console.error("");
  console.error("To get a service account key:");
  console.error("  1. Go to Firebase Console → Project Settings → Service accounts");
  console.error("  2. Click 'Generate new private key'");
  console.error("  3. Save the JSON file securely (do NOT commit to git)");
  console.error("");
  console.error(err.message);
  process.exit(1);
}

const auth = getAuth();

async function main() {
  console.log(`\n🔍 Looking up user: ${uid}\n`);

  // Verify user exists
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (err) {
    console.error(`Error: User with UID "${uid}" not found.`);
    console.error(err.message);
    process.exit(1);
  }

  console.log("=== USER INFO ===");
  console.log(`  Email: ${user.email || "(no email)"}`);
  console.log(`  UID: ${user.uid}`);
  console.log(`  Created: ${user.metadata.creationTime}`);
  console.log(`  Current claims: ${JSON.stringify(user.customClaims || {})}`);

  if (remove) {
    // Remove admin claim
    console.log("\n📝 Removing admin claim...\n");
    const currentClaims = user.customClaims || {};
    delete currentClaims.admin;
    await auth.setCustomUserClaims(uid, currentClaims);
    console.log("✅ Admin claim removed successfully.");
  } else {
    // Set admin claim
    console.log("\n📝 Setting admin=true claim...\n");
    const currentClaims = user.customClaims || {};
    await auth.setCustomUserClaims(uid, { ...currentClaims, admin: true });
    console.log("✅ Admin claim set successfully.");
  }

  // Verify the change
  const updatedUser = await auth.getUser(uid);
  console.log(`\n=== UPDATED CLAIMS ===`);
  console.log(`  ${JSON.stringify(updatedUser.customClaims || {})}`);

  console.log("\n📋 Next steps:");
  console.log("  1. In admin-web, click 'Sign Out' then sign in again");
  console.log("     OR click '토큰 새로고침' button on the main page");
  console.log("  2. The claims will now show admin=true");
  console.log("  3. You can now access the /admin page\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
