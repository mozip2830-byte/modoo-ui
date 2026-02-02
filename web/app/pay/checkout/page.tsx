import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PageClient = dynamicImport(() => import("./PageClient"), { ssr: false });

export default function Page() {
  return <PageClient />;
}
