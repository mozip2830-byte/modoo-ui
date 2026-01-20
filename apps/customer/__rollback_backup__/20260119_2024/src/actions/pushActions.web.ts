type RegisterInput = {
  uid: string;
  role: "partner" | "customer";
  displayName?: string | null;
};

type UnregisterInput = {
  uid: string;
  token: string;
};

export async function registerFcmToken(_input: RegisterInput) {
  return null;
}

export async function unregisterFcmToken(_input: UnregisterInput) {
  return;
}
