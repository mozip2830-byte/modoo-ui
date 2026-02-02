import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const shouldCommit = args.has("--commit");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

if (!Number.isFinite(limit)) {
  console.error("Invalid --limit value");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const BATCH_SIZE = 400;

let updated = 0;
let scanned = 0;
let batch = db.batch();
let batchCount = 0;
let lastDoc = null;

console.log("Backfill starting...");
console.log(`commit=${shouldCommit} limit=${limit || "none"}`);

while (true) {
  let query = db
    .collection("requests")
    .where("selectedPartnerId", "!=", null)
    .orderBy("selectedPartnerId")
    .limit(500);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snap = await query.get();
  if (snap.empty) break;

  for (const docSnap of snap.docs) {
    scanned += 1;
    const data = docSnap.data();
    const status = data?.status ?? null;
    const selectedPartnerId = data?.selectedPartnerId ?? null;
    const isClosed = data?.isClosed ?? null;

    if (!selectedPartnerId) continue;
    if (status === "completed") continue;

    const updatePayload = {
      status: "completed",
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (isClosed !== true) {
      updatePayload.isClosed = true;
      updatePayload.closedAt = FieldValue.serverTimestamp();
    }

    if (shouldCommit) {
      batch.update(docSnap.ref, updatePayload);
      batchCount += 1;
    }

    updated += 1;

    if (shouldCommit && batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
      console.log(`Committed ${BATCH_SIZE} updates so far...`);
    }

    if (limit && updated >= limit) {
      break;
    }
  }

  lastDoc = snap.docs[snap.docs.length - 1];

  if (limit && updated >= limit) {
    break;
  }
}

if (shouldCommit && batchCount > 0) {
  await batch.commit();
}

console.log("Backfill done.");
console.log(`scanned=${scanned} updated=${updated}`);
if (!shouldCommit) {
  console.log("Dry run only. Re-run with --commit to apply changes.");
}
