type Role = "partner" | "customer";

export async function registerFcmToken(_: { uid: string; role: Role }): Promise<string | null> {
  // Push is disabled for now to keep bundling stable in Expo Go + pnpm workspace.
  // We'll re-enable when switching to a development build (EAS).
  return null;
}

export async function unregisterFcmToken(_: { uid: string; token: string }): Promise<void> {
  return;
}
