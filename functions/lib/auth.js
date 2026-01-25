"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authNaver = exports.authKakao = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
if (!admin.apps.length) {
    admin.initializeApp();
}
function getEnv(key) {
    const value = process.env[key];
    if (!value) {
        const cfg = functions.config();
        const fromConfig = key === "KAKAO_REST_API_KEY"
            ? cfg.kakao?.rest_api_key
            : key === "KAKAO_CLIENT_SECRET"
                ? cfg.kakao?.client_secret
                : key === "NAVER_CLIENT_ID"
                    ? cfg.naver?.client_id
                    : key === "NAVER_CLIENT_SECRET"
                        ? cfg.naver?.client_secret
                        : undefined;
        if (!fromConfig) {
            throw new functions.https.HttpsError("failed-precondition", `Missing env: ${key}`);
        }
        return String(fromConfig);
    }
    return value;
}
function setCors(res, origin = "*") {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
async function readJsonBody(req) {
    if (req.body && typeof req.body === "object")
        return req.body;
    const raw = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function fetchKakaoProfile(accessToken) {
    const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
        throw new functions.https.HttpsError("unauthenticated", "Kakao profile failed");
    }
    const profile = (await profileRes.json());
    const id = String(profile.id ?? "");
    const account = profile.kakao_account ?? {};
    const email = account.email;
    const nickname = profile.properties?.nickname;
    return { provider: "kakao", id, email, nickname };
}
async function fetchNaverProfile(accessToken) {
    const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
        throw new functions.https.HttpsError("unauthenticated", "Naver profile failed");
    }
    const profile = (await profileRes.json());
    const response = profile.response ?? {};
    const id = String(response.id ?? "");
    const email = response.email;
    const name = response.name;
    const nickname = response.nickname;
    return { provider: "naver", id, email, name, nickname };
}
async function exchangeKakaoToken(input) {
    const clientId = getEnv("KAKAO_REST_API_KEY");
    const clientSecret = process.env.KAKAO_CLIENT_SECRET ?? "";
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: input.redirectUri,
        code: input.code,
    });
    if (clientSecret)
        body.append("client_secret", clientSecret);
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!tokenRes.ok) {
        throw new functions.https.HttpsError("unauthenticated", "Kakao token failed");
    }
    const token = (await tokenRes.json());
    if (!token.access_token) {
        throw new functions.https.HttpsError("unauthenticated", "Kakao token missing");
    }
    return fetchKakaoProfile(token.access_token);
}
async function exchangeNaverToken(input) {
    const clientId = getEnv("NAVER_CLIENT_ID");
    const clientSecret = getEnv("NAVER_CLIENT_SECRET");
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: input.code,
        state: input.state,
    });
    const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
    if (!tokenRes.ok) {
        throw new functions.https.HttpsError("unauthenticated", "Naver token failed");
    }
    const token = (await tokenRes.json());
    if (!token.access_token) {
        throw new functions.https.HttpsError("unauthenticated", "Naver token missing");
    }
    return fetchNaverProfile(token.access_token);
}
async function issueFirebaseToken(profile) {
    if (!profile.id) {
        throw new functions.https.HttpsError("invalid-argument", "Missing provider id");
    }
    const uid = `${profile.provider}:${profile.id}`;
    const customToken = await admin.auth().createCustomToken(uid, {
        provider: profile.provider,
    });
    return { customToken, profile };
}
exports.authKakao = functions.https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }
    try {
        const body = await readJsonBody(req);
        const code = String(body.code ?? "");
        const redirectUri = String(body.redirectUri ?? "");
        if (!code || !redirectUri) {
            res.status(400).json({ error: "missing_code_or_redirect" });
            return;
        }
        const profile = await exchangeKakaoToken({ code, redirectUri });
        const { customToken } = await issueFirebaseToken(profile);
        res.json({ firebaseToken: customToken, profile });
    }
    catch (err) {
        console.error("[auth][kakao] error", err);
        res.status(401).json({ error: "auth_failed" });
    }
});
exports.authNaver = functions.https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }
    try {
        const body = await readJsonBody(req);
        const code = String(body.code ?? "");
        const state = String(body.state ?? "");
        if (!code || !state) {
            res.status(400).json({ error: "missing_code_or_state" });
            return;
        }
        const profile = await exchangeNaverToken({ code, state });
        const { customToken } = await issueFirebaseToken(profile);
        res.json({ firebaseToken: customToken, profile });
    }
    catch (err) {
        console.error("[auth][naver] error", err);
        res.status(401).json({ error: "auth_failed" });
    }
});
