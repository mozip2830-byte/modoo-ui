// app/(customer)/requests/address-search.tsx
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { setAddressDraft, type AddressDraft } from "@/src/lib/addressDraftStore";
import { colors } from "@/src/ui/tokens";

export default function AddressSearchScreen() {
  const router = useRouter();

  const html = useMemo(() => {
    // Daum Postcode (Kakao) WebView
    // 선택 시 ReactNativeWebView.postMessage로 결과 전달
    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { height: 100%; margin: 0; padding: 0; background: #fff; }
      #wrap { width: 100%; height: 100%; }
    </style>
    <script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
  </head>
  <body>
    <div id="wrap"></div>
    <script>
      function post(data){
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        }
      }
      new daum.Postcode({
        oncomplete: function(data) {
          // roadAddress: 도로명(고정), jibunAddress: 지번(참고)
          post({
            roadAddress: data.roadAddress || "",
            jibunAddress: data.jibunAddress || "",
            zonecode: data.zonecode || "",
            bname: data.bname || "",
            buildingName: data.buildingName || ""
          });
        },
        width: '100%',
        height: '100%'
      }).embed(document.getElementById('wrap'));
    </script>
  </body>
</html>
`;
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        )}
        onMessage={(e) => {
          try {
            const raw = e.nativeEvent.data;
            const parsed = JSON.parse(raw) as AddressDraft;

            // 도로명 필수
            if (!parsed?.roadAddress?.trim()) return;

            setAddressDraft({
              roadAddress: parsed.roadAddress,
              jibunAddress: parsed.jibunAddress,
              zonecode: parsed.zonecode,
              bname: parsed.bname,
              buildingName: parsed.buildingName,
            });

            router.back();
          } catch (err) {
            // ignore
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
