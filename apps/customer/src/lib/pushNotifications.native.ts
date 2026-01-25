declare const require: (id: string) => any;
import { requireOptionalNativeModule } from "expo-modules-core";

let cachedExpoGo: boolean | null = null;
let cachedNotifications: any | null | undefined;
let cachedNoop: any | null = null;

function loadConstants() {
  try {
    return require("expo-constants");
  } catch (err) {
    console.warn("[push] expo-constants unavailable", err);
    return null;
  }
}

export function isExpoGo() {
  if (cachedExpoGo !== null) return cachedExpoGo;

  const Constants = loadConstants();
  if (!Constants) {
    cachedExpoGo = false;
    return cachedExpoGo;
  }

  const appOwnership = Constants.appOwnership;
  const executionEnvironment = Constants.executionEnvironment;
  cachedExpoGo = appOwnership === "expo" || executionEnvironment === "storeClient";
  return cachedExpoGo;
}

function getNoopNotifications() {
  if (cachedNoop) return cachedNoop;

  const noopSubscription = { remove: () => {} };
  cachedNoop = {
    getPermissionsAsync: async () => ({ status: "denied" }),
    requestPermissionsAsync: async () => ({ status: "denied" }),
    getDevicePushTokenAsync: async () => ({ data: "" }),
    addNotificationReceivedListener: () => noopSubscription,
    addNotificationResponseReceivedListener: () => noopSubscription,
    setNotificationHandler: () => {},
    removeNotificationSubscription: () => {},
  };

  return cachedNoop;
}

export function loadNotifications() {
  if (isExpoGo()) return getNoopNotifications();

  if (cachedNotifications !== undefined) return cachedNotifications;

  try {
    const pushTokenManager = requireOptionalNativeModule("ExpoPushTokenManager");
    if (!pushTokenManager) {
      console.warn("[push] ExpoPushTokenManager missing, using noop notifications");
      cachedNotifications = getNoopNotifications();
      return cachedNotifications;
    }
    cachedNotifications = require("expo-notifications");
    return cachedNotifications;
  } catch (err) {
    console.warn("[push] expo-notifications unavailable", err);
    cachedNotifications = getNoopNotifications();
    return cachedNotifications;
  }
}
