# Firestore Security Rules

아래 규칙을 Firebase Console → Firestore → Rules에 복사하여 사용하세요.

## 전체 규칙

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ========================================
    // Helper Functions
    // ========================================

    function signedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return signedIn() && request.auth.token.admin == true;
    }

    function isOwner(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    // ========================================
    // Customer Users
    // ========================================

    match /customerUsers/{userId} {
      // 읽기: 본인 또는 관리자
      allow read: if isOwner(userId) || isAdmin();

      // 생성: 본인만 (회원가입 시)
      allow create: if isOwner(userId);

      // 수정: 본인은 일반 필드만, 관리자는 모든 필드
      allow update: if isOwner(userId) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['points', 'tier', 'status'])
                    || isAdmin();

      // 삭제: 관리자만
      allow delete: if isAdmin();
    }

    // ========================================
    // Partner Users
    // ========================================

    match /partnerUsers/{userId} {
      // 읽기: 본인 또는 관리자
      allow read: if isOwner(userId) || isAdmin();

      // 생성: 본인만 (회원가입 시)
      allow create: if isOwner(userId);

      // 수정: 본인은 일반 필드만, 관리자는 모든 필드 (인증/구독/포인트 등)
      allow update: if isOwner(userId) && !request.resource.data.diff(resource.data).affectedKeys().hasAny([
                      'businessVerified', 'verificationStatus', 'grade',
                      'subscriptionStatus', 'subscriptionPlan', 'subscriptionEndDate',
                      'points'
                    ])
                    || isAdmin();

      // 삭제: 관리자만
      allow delete: if isAdmin();
    }

    // ========================================
    // Support Tickets
    // ========================================

    match /supportTickets/{ticketId} {
      // 읽기: 티켓 소유자 또는 관리자
      allow read: if signedIn() && (resource.data.userId == request.auth.uid || isAdmin());

      // 생성: 로그인한 사용자 (본인 userId로만)
      allow create: if signedIn() && request.resource.data.userId == request.auth.uid;

      // 수정: 소유자는 subject만, 관리자는 모든 필드
      allow update: if signedIn() && resource.data.userId == request.auth.uid
                       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['subject', 'updatedAt'])
                    || isAdmin();

      // 삭제: 관리자만
      allow delete: if isAdmin();

      // 메시지 서브컬렉션
      match /messages/{messageId} {
        // 읽기: 티켓 소유자 또는 관리자
        allow read: if signedIn() && (get(/databases/$(database)/documents/supportTickets/$(ticketId)).data.userId == request.auth.uid || isAdmin());

        // 생성: 소유자는 user 타입으로만, 관리자는 admin 타입으로
        allow create: if signedIn() && (
          (get(/databases/$(database)/documents/supportTickets/$(ticketId)).data.userId == request.auth.uid
           && request.resource.data.senderType == 'user'
           && request.resource.data.senderId == request.auth.uid)
          || (isAdmin() && request.resource.data.senderType == 'admin')
        );

        // 수정/삭제: 불가
        allow update, delete: if false;
      }
    }

    // ========================================
    // Admin Audit Logs
    // ========================================

    match /adminAuditLogs/{logId} {
      // 읽기: 관리자만
      allow read: if isAdmin();

      // 생성: 관리자만
      allow create: if isAdmin();

      // 수정/삭제: 불가 (감사 로그는 불변)
      allow update, delete: if false;
    }

    // ========================================
    // Chat Rooms
    // ========================================

    match /chatRooms/{roomId} {
      // 읽기: 참여자 또는 관리자
      allow read: if signedIn() && (request.auth.uid in resource.data.participants || isAdmin());

      // 생성: 로그인한 사용자
      allow create: if signedIn() && request.auth.uid in request.resource.data.participants;

      // 수정: 참여자만 (lastMessage 등)
      allow update: if signedIn() && request.auth.uid in resource.data.participants;

      // 삭제: 관리자만
      allow delete: if isAdmin();

      // 메시지 서브컬렉션
      match /messages/{messageId} {
        allow read: if signedIn() && (request.auth.uid in get(/databases/$(database)/documents/chatRooms/$(roomId)).data.participants || isAdmin());
        allow create: if signedIn() && request.auth.uid in get(/databases/$(database)/documents/chatRooms/$(roomId)).data.participants;
        allow update, delete: if false;
      }
    }

    // ========================================
    // Requests (견적 요청)
    // ========================================

    match /requests/{requestId} {
      // 읽기: 요청자, 해당 지역/서비스 파트너, 또는 관리자
      allow read: if signedIn() && (resource.data.customerId == request.auth.uid || isAdmin());

      // 생성: 고객만
      allow create: if signedIn();

      // 수정: 요청자 또는 관리자
      allow update: if signedIn() && (resource.data.customerId == request.auth.uid || isAdmin());

      // 삭제: 관리자만
      allow delete: if isAdmin();
    }

    // ========================================
    // Quotes (견적서)
    // ========================================

    match /quotes/{quoteId} {
      // 읽기: 요청자, 견적 작성 파트너, 또는 관리자
      allow read: if signedIn() && (
        resource.data.customerId == request.auth.uid ||
        resource.data.partnerId == request.auth.uid ||
        isAdmin()
      );

      // 생성: 파트너
      allow create: if signedIn();

      // 수정: 작성자 또는 관리자
      allow update: if signedIn() && (resource.data.partnerId == request.auth.uid || isAdmin());

      // 삭제: 관리자만
      allow delete: if isAdmin();
    }

  }
}
```

## 컬렉션 스키마

### customerUsers/{uid}

> **참고**: 고객 포인트 기능은 제거되었습니다. `points`, `tier` 필드는 더 이상 사용되지 않습니다.

| 필드 | 타입 | 설명 | 관리자 전용 |
|------|------|------|------------|
| email | string | 이메일 | |
| displayName | string | 표시 이름 | |
| phoneNumber | string | 전화번호 | |
| status | string | 상태 (active/suspended/banned) | ✅ |
| createdAt | timestamp | 생성일 | |
| updatedAt | timestamp | 수정일 | |

### partnerUsers/{uid}

| 필드 | 타입 | 설명 | 관리자 전용 |
|------|------|------|------------|
| email | string | 이메일 | |
| displayName | string | 표시 이름 | |
| phoneNumber | string | 전화번호 | |
| businessName | string | 상호명 | |
| businessNumber | string | 사업자번호 | |
| businessVerified | boolean | 사업자 인증 여부 | ✅ |
| verificationStatus | string | 인증 상태 | ✅ |
| grade | string | 등급 (정회원/프리미엄) | ✅ |
| subscriptionStatus | string | 구독 상태 | ✅ |
| subscriptionPlan | string | 구독 플랜 | ✅ |
| subscriptionEndDate | timestamp | 구독 만료일 | ✅ |
| points | number | 포인트 (견적 제출용) | ✅ |
| trustScore | number | 신뢰 점수 | |
| regions | array | 활동 지역 | |
| services | array | 제공 서비스 | |
| createdAt | timestamp | 생성일 | |
| updatedAt | timestamp | 수정일 | |

### supportTickets/{ticketId}

| 필드 | 타입 | 설명 |
|------|------|------|
| userId | string | 문의자 UID |
| userType | string | 사용자 유형 (customer/partner) |
| userEmail | string | 문의자 이메일 |
| subject | string | 제목 |
| status | string | 상태 (open/inProgress/resolved/closed) |
| priority | string | 우선순위 (low/medium/high) |
| assignedTo | string | 담당 관리자 UID (선택) |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |
| resolvedAt | timestamp | 해결일 (선택) |

### supportTickets/{ticketId}/messages/{messageId}

| 필드 | 타입 | 설명 |
|------|------|------|
| senderId | string | 발신자 UID |
| senderType | string | 발신자 유형 (user/admin) |
| senderEmail | string | 발신자 이메일 |
| content | string | 메시지 내용 |
| createdAt | timestamp | 생성일 |

### adminAuditLogs/{logId}

| 필드 | 타입 | 설명 |
|------|------|------|
| adminUid | string | 관리자 UID |
| adminEmail | string | 관리자 이메일 |
| action | string | 수행한 액션 (UPDATE_CUSTOMER_USER, UPDATE_PARTNER_USER, partner_points_update, UPDATE_TICKET_STATUS 등) |
| targetCollection | string | 대상 컬렉션 |
| targetDocId | string | 대상 문서 ID |
| before | object | 변경 전 데이터 (선택) |
| after | object | 변경 후 데이터 (선택) |
| createdAt | timestamp | 생성일 |

## 관리자 권한 설정

관리자 권한은 Firebase Custom Claims를 통해 설정됩니다.

```javascript
// admin claim 확인
request.auth.token.admin == true
```

관리자 권한 부여 방법:
1. `scripts/setAdminClaim.mjs` 스크립트 사용
2. Firebase Admin SDK 직접 호출

자세한 내용은 `scripts/README.md` 참조.
