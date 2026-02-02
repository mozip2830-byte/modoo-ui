import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(); // web/
const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneWeb = path.join(standaloneRoot, "web");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(src, dest) {
  if (await exists(src)) {
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
    return true;
  }
  return false;
}

async function main() {
  // standalone 결과물 위치 결정
  const targetBase = (await exists(standaloneWeb)) ? standaloneWeb : standaloneRoot;

  if (!await exists(targetBase)) {
    throw new Error(`Standalone build directory not found: ${targetBase}`);
  }

  console.log(`[postbuild] Using standalone base: ${targetBase}`);

  // .next/static 복사
  const targetStatic = path.join(targetBase, ".next", "static");
  const sourceStatic = path.join(root, ".next", "static");
  if (await exists(sourceStatic)) {
    await mkdir(targetStatic, { recursive: true });
    await cp(sourceStatic, targetStatic, { recursive: true });
    console.log(`[postbuild] copied .next/static to ${targetStatic}`);
  }

  // public 복사
  const targetPublic = path.join(targetBase, "public");
  const sourcePublic = path.join(root, "public");
  if (await exists(sourcePublic)) {
    await mkdir(targetPublic, { recursive: true });
    await cp(sourcePublic, targetPublic, { recursive: true });
    console.log(`[postbuild] copied public to ${targetPublic}`);
  }

  // server.js 존재 확인
  const serverJs = path.join(targetBase, "server.js");
  if (!await exists(serverJs)) {
    throw new Error(`server.js not found at ${serverJs}. Build may have failed.`);
  }

  console.log(`[postbuild] server.js verified at ${serverJs}`);
  console.log(`[postbuild] Build successful. Ready for deployment.`);
}

main().catch((e) => {
  console.error(`[postbuild] Error:`, e.message);
  process.exit(1);
});
