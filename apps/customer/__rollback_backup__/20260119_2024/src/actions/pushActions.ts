// Re-export types for TypeScript checking.
// At runtime, Metro resolves to .native.ts or .web.ts based on platform.

type RegisterInput = {
  uid: string;
  role: "partner" | "customer";
  displayName?: string | null;
};

type UnregisterInput = {
  uid: string;
  token: string;
};

export declare function registerFcmToken(input: RegisterInput): Promise<string | null>;
export declare function unregisterFcmToken(input: UnregisterInput): Promise<void>;
