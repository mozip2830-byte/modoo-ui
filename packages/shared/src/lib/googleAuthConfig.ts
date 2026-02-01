export const googleAuthConfig = {
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
};

export const hasGoogleWebClientId = Boolean(googleAuthConfig.webClientId);
export const hasGoogleAndroidClientId = Boolean(googleAuthConfig.androidClientId);
export const hasGoogleIosClientId = Boolean(googleAuthConfig.iosClientId);
