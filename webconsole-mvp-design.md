# Web Console MVP — Design Document

## 0. 목적

본 문서는 [Leidden-webconsole-mvp](https://github.com/Leidden/Leidden-webconsole-mvp) 프로젝트의 설계 기준을 정리한다. CloudStack 4.22 + KVM + Ceph 기반 IaaS 위에 사용자가 SSH 키 등록 / VM 생성 / 콘솔 접속 / 사용량 확인을 수행할 수 있는 **자체 웹콘솔 MVP**이다.

본 lab의 인프라/검증 결과는 `iaas-cloudstack-lab` 저장소(특히 `cloudstack-virtual-lab-mvp.md`, `cloudstack-network-concepts.md`, `server-command-log.md`)를 참조.

## 1. 결정 사항 요약

| 항목 | 값 |
|---|---|
| 스택 | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| 인증 | Auth.js (NextAuth v5) Credentials provider (이메일+비밀번호) |
| DB / ORM | PostgreSQL 16 + Prisma |
| CloudStack 클라이언트 | 자체 작성 TypeScript (HMAC-SHA1 서명, async jobid 폴링 헬퍼) |
| CloudStack 인증 모델 | C-1: 자체 사용자 DB + 백엔드는 service account API key로 호출하면서 account/domainid 컨텍스트 전달 |
| 실행 위치 (개발) | cs-webconsole-01 (Ubuntu 24.04, Docker) |
| 실행 위치 (운영) | 추후 별도 배포 (GitHub Actions → registry → 호스트 pull) |
| 코드 편집 모델 | 코덱스가 cs-webconsole-01에 SSH로 직접 작성 |
| repo | github.com/Leidden/Leidden-webconsole-mvp (Deploy key SSH) |
| 외부 노출 | WinNAT 28000 → cs-webconsole-01:3000 (Next.js dev), 사용자 IP 한정 |

## 2. 아키텍처

```
사용자 브라우저 (Mac, IP 103.243.200.17)
        │ HTTP(S)
        ▼
Windows Host (211.233.50.43)
   WinNAT 28000 → cs-webconsole-01:3000
        │
        ▼
cs-webconsole-01 (10.10.10.142, Ubuntu 24.04)
  ├ Docker Compose
  │   ├ app (Next.js 14, port 3000)
  │   │     - Auth.js (사용자 인증)
  │   │     - Prisma (Postgres)
  │   │     - CloudStack client (HMAC-SHA1)
  │   └ db (Postgres 16)
  └ ~/.config/webconsole/credentials.env
       (CLOUDSTACK_API_URL/KEY/SECRET, mode 600)
        │
        │ HMAC-signed GET (private LAN)
        ▼
cs-mgmt-01 / cs-mgmt-02 (CloudStack Management, 10.10.10.11/12:8080)
   - 자체 service account "webconsole-backend" (Domain Admin under ROOT)
   - 사용자 컨텍스트는 호출 파라미터로 (account=user-handle, domainid=...)
        │
        ▼
KVM/Ceph 노드 + Ceph RBD primary + NFS secondary
```

## 3. CloudStack 인증 모델 (C-1) 상세

자체 웹콘솔의 사용자는 **CloudStack의 User가 아니라** 우리 자체 DB의 사용자다. CloudStack 호출 권한은 백엔드의 단일 service account가 가진다.

| 자체 웹콘솔 측 | CloudStack 측 |
|---|---|
| 사용자 가입 | (백엔드가) `createAccount` + `createUser` + `registerUserKeys` (Domain `customers` 하위에 1 Account = 1 사용자) |
| 사용자 로그인 | Auth.js Credentials, 우리 자체 비밀번호 검증 |
| 사용자가 VM 생성 클릭 | 백엔드는 service account 키로 `deployVirtualMachine` 호출하되 `account=<사용자 handle>` `domainid=customers/<...>` 전달 |
| 권한/쿼터 | `updateResourceLimit`로 가입 시 등급별 한도 설정 |
| API key 노출 | 사용자에게 노출하지 않음. 사용자는 모든 작업을 우리 웹콘솔 통해서만 |

장점: CloudStack User API key가 사용자 PC를 떠나지 않음. 백엔드 키 1개만 안전하게 보관하면 됨.

## 4. 디렉토리 구조

```
.
├── webconsole-mvp-design.md       (이 문서)
├── README.md                      개발자용 setup 가이드
├── package.json
├── tsconfig.json
├── next.config.js
├── next-env.d.ts
├── tailwind.config.ts
├── postcss.config.js
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── .env.example
├── prisma/
│   └── schema.prisma
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx               (홈, 헬스체크 결과 표시)
    │   ├── globals.css
    │   └── api/
    │       └── health/route.ts    (헬스체크 + listZones)
    └── lib/
        └── cloudstack.ts          (HMAC 서명, csCall, listZones 등)
```

이후 모듈 추가 시 `src/app/(dashboard)/...`, `src/app/(auth)/...`, `src/lib/auth.ts`, `src/lib/db.ts` 등이 늘어난다.

## 5. 환경변수

| 변수 | 의미 | 예시 |
|---|---|---|
| `CLOUDSTACK_API_URL` | CloudStack API endpoint | `http://10.10.10.11:8080/client/api` |
| `CLOUDSTACK_API_KEY` | webconsole-backend service account API key | (86 chars) |
| `CLOUDSTACK_SECRET_KEY` | 동일 service account secret | (86 chars) |
| `DATABASE_URL` | Postgres 연결 문자열 | `postgresql://webconsole:...@db:5432/webconsole?schema=public` |
| `POSTGRES_PASSWORD` | Postgres 컨테이너 root 비밀번호 | (32+ chars random) |
| `AUTH_SECRET` | NextAuth 세션 서명 비밀 | (32+ chars random) |
| `AUTH_TRUST_HOST` | 리버스 프록시 환경에서 host 검증 | `true` |

`.env.local` 에만 저장하고 절대 git에 커밋하지 않는다. `.env.example`을 템플릿으로 제공.

## 6. CloudStack 클라이언트 설계

`src/lib/cloudstack.ts`에 한 모듈로 응집한다.

```text
csCall(command, params)   → HMAC-SHA1 서명, GET 요청, JSON 반환
csWaitJob(jobid, timeout) → queryAsyncJobResult를 폴링, 결과 반환
listZones(), listTemplates(), listServiceOfferings() → 자주 쓰는 헬퍼
deployVm(...), destroyVm(...), startVm(...), stopVm(...)
registerUserSshKey(...), createUserNetwork(...)
```

**컨텍스트 처리**: 모든 헬퍼는 옵션 매개변수로 `account`, `domainid`를 받고, 자체 웹콘솔 사용자 컨텍스트를 그대로 전달한다.

## 7. DB 스키마 초안 (Prisma)

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  passwordHash    String
  name            String?
  csAccountName   String    @unique  // CloudStack Account 핸들
  csDomainId      String              // CloudStack Domain id (customers/<...>)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  sshKeys         SshKey[]
  sessions        Session[]
}

model SshKey {
  id          String   @id @default(cuid())
  userId      String
  name        String
  fingerprint String
  source      String   // "uploaded" or "generated"
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, name])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

스켈레톤 단계에선 generator/datasource만 두고, 모듈 추가 시점에 위 모델을 채운다.

## 8. 단계 로드맵

| 단계 | 목표 | 결과물 |
|---|---|---|
| **0. 스켈레톤** (지금) | 프로젝트 골격 + DB 연결 + CloudStack listZones 호출 검증 | `docker compose up -d` 후 `http://211.233.50.43:28000`에서 zones 표시 |
| 1. 인증 | Auth.js Credentials, 회원가입/로그인 | 가입 시 CloudStack에 Account 자동 생성 |
| 2. SSH 키 관리 | 업로드/서버 생성, 목록, 삭제 | 사용자 SSH 키 자동 주입 흐름 완성 |
| 3. VM 라이프사이클 | 템플릿/사양 카탈로그 + 생성/시작/중지/재부팅/삭제 | 사용자가 자기 VM 운용 가능 |
| 4. 네트워크 자동 | 가입 시 사용자별 default Isolated VXLAN 자동 생성 | 검증된 패턴 코드화 |
| 5. 콘솔 보기 | createConsoleEndpoint URL 노출 (외부 접근 정책 동반) | 브라우저 콘솔 가능 |
| 6. 사용량/한도 | listResourceLimits 표시, ResourceCount 시각화 | 쿼터 운영 |
| 7. 운영 배포 | GitHub Actions → 이미지 빌드/푸시 → 호스트 pull | staging/prod 분리 |

## 9. 보안 정책

- CloudStack service account의 secret은 git에 커밋 금지 (`.env.local`만 사용)
- 비밀번호는 bcrypt(또는 argon2) 해시
- CSRF 보호: Auth.js 기본 쿠키 + SameSite Lax
- HTTPS: 운영 단계에서 reverse proxy + Let's Encrypt
- 외부 노출: WinNAT RemoteExternalIPAddressPrefix를 사용자 IP `/32`로 제한 중
- 콘솔 토큰 평문 노출 위험 검토 (현재 CloudStack `consoleproxy.sslEnabled=false`)

## 10. 미해결/보류 항목

| 항목 | 상태 |
|---|---|
| 콘솔 외부 노출 정식 설계 | 보류 (자체 웹콘솔 통해 reverse proxy 패턴) |
| SSH 키 reset 운영 보강 | 보류 (cloud-init 캐시 한계, ConfigDrive 검토) |
| 결제/쿼터 자동 적용 | 보류 (관리자가 수동 한도 변경) |
| 백업/스냅샷 모듈 | 보류 |
| 멀티 zone | 보류 (단일 zone-01) |

## 11. 본 lab과의 연결

| 검증 결과 | 본 프로젝트의 적용 |
|---|---|
| Isolated + VXLAN 자동 생성 | 사용자 가입 시 default network 생성 패턴 그대로 |
| SSH 키 cloud-init 주입 | registerSSHKeyPair → keypairs= deployVM |
| CloudStack 멀티테넌트 격리 | C-1 모델로 사용자 컨텍스트 분리 |
| Source NAT + PortForwarding | 외부 SSH/HTTP 노출 흐름 |
| 쿼터 ResourceLimit | 사용자 등급별 한도 정책 |
| RBD primary, NFS secondary | 인프라 측, 본 앱은 추상화된 API만 호출 |
