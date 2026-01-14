#!/usr/bin/env node
/**
 * DEV-ONLY: Approve a partner user via Firebase Admin SDK (bypasses Firestore rules)
 *
 * Usage:
 *   node scripts/approvePartner.mjs --uid <UID> [--grade <GRADE>]
 *
 * Credentials:
 *   - Uses Application Default Credentials if available
 *   - Otherwise set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path
 *
 * Example:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccount.json"
 *   node scripts/approvePartner.mjs --uid chi7RgshKfQqDWObvbOt4wMXUpO2
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { parseArgs } from "node:util";

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    uid: { type: "string", short: "u" },
    grade: { type: "string", short: "g", default: "정회원" },
  },
});

const uid = values.uid;
const grade = values.grade;

if (!uid) {
  console.error("Error: --uid <UID> is required");
  console.error("Usage: node scripts/approvePartner.mjs --uid <UID> [--grade <GRADE>]");
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
  console.error("Ensure GOOGLE_APPLICATION_CREDENTIALS is set or ADC is configured.");
  console.error(err.message);
  process.exit(1);
}

const db = getFirestore();
const docRef = db.collection("partnerUsers").doc(uid);

// Fields to update
const FIELDS_TO_SHOW = [
  "businessVerified",
  "verificationStatus",
  "grade",
  "approvedAt",
  "verificationUpdatedAt",
];

async function main() {
  console.log(`\n🔍 Fetching partnerUsers/${uid} ...\n`);

  // Get before state
  const beforeSnap = await docRef.get();
  if (!beforeSnap.exists) {
    console.error(`Error: Document partnerUsers/${uid} does not exist.`);
    process.exit(1);
  }

  const beforeData = beforeSnap.data();
  console.log("=== BEFORE ===");
  for (const field of FIELDS_TO_SHOW) {
    const val = beforeData[field];
    console.log(`  ${field}: ${val instanceof Date ? val.toISOString() : JSON.stringify(val)}`);
  }

  // Update
  console.log(`\n📝 Updating with grade="${grade}" ...\n`);
  await docRef.update({
    businessVerified: true,
    verificationStatus: "승인완료",
    grade: grade,
    approvedAt: FieldValue.serverTimestamp(),
    verificationUpdatedAt: FieldValue.serverTimestamp(),
  });

  // Get after state
  const afterSnap = await docRef.get();
  const afterData = afterSnap.data();
  console.log("=== AFTER ===");
  for (const field of FIELDS_TO_SHOW) {
    const val = afterData[field];
    const display = val?.toDate ? val.toDate().toISOString() : JSON.stringify(val);
    console.log(`  ${field}: ${display}`);
  }

  console.log("\n✅ Partner approved successfully.\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
