import type { DecisionPacket, StructuredReview } from '../../shared/types';

export const SHOWCASE_DEFAULT_IDEA =
  'Implement a Zero-Trust JWT Authentication & Token Revocation Engine with Constant-Time Signature Verification, Rate Limiting, and Automated Unit Tests';

export const SHOWCASE_TURNS = [
  {
    providerId: 'chatgpt' as const,
    name: 'ChatGPT (Lead Architect)',
    role: 'Lead Architect',
    content: `### [Turn 1: Lead Architect Proposal]

**System Decomposition & Architectural Overview:**
We are designing a Zero-Trust JWT Authentication & Token Revocation Engine compliant with OWASP Top 10 API Security guidelines.

1. **Modular Architecture:**
   - \`TokenEngine\`: Cryptographic token signing, claim parsing, and verification.
   - \`RevocationStore\`: In-memory Bloom-filter backed revocation cache with automatic TTL pruning.
   - \`RateLimiter\`: Token-bucket rate limiter enforcing max 100 verifications/second per IP.

2. **Key Security Decisions:**
   - Enforce strictly asymmetric/symmetric algorithm pinning (HS256) to block algorithm confusion attacks (e.g. 'alg: none' and RS/HS confusion).
   - Use Node.js \`crypto.timingSafeEqual\` for all HMAC digest comparisons to eliminate timing side-channel vulnerabilities.

3. **Acceptance & Quality Criteria:**
   - 100% test assertion coverage on token validation boundaries.
   - Zero-unhandled exceptions on malformed, expired, or manipulated payloads.`,
  },
  {
    providerId: 'gemini' as const,
    name: 'Gemini (Security & Feasibility)',
    role: 'Security & Feasibility Reviewer',
    content: `### [Turn 2: Security & Feasibility Audit]

**Feasibility & Cryptographic Verification:**
I have analyzed ChatGPT's architecture proposal against industry security standards.

1. **Cryptographic Validation:**
   - Agree on \`crypto.timingSafeEqual\`. Crucial implementation detail: both buffers must have equal byte length prior to comparison; otherwise, length mismatches leak through execution time.
   - We must enforce a maximum clock skew tolerance of exactly 5 seconds for \`nbf\` (Not Before) and \`exp\` (Expiration) claims.

2. **Memory Safety & Resource Bounds:**
   - The token revocation set must include an LRU eviction fallback with a maximum capacity bound of 50,000 revoked IDs to prevent Heap Exhaustion (Denial of Service).

3. **Automated Verification:**
   - We require automated tests explicitly covering:
     * Valid token verification (happy path)
     * Tampered signature detection (expected rejection)
     * Expired token rejection
     * Malformed token structure (invalid Base64URL)`,
  },
  {
    providerId: 'deepseek' as const,
    name: 'DeepSeek (Code Spec)',
    role: 'Code Spec Specialist',
    content: `### [Turn 3: Interface Specification & Contract Design]

**Technical Interface & Type Contract:**
Building upon Gemini's cryptographic recommendations, here is the exact TypeScript specification:

\`\`\`typescript
export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  roles: string[];
}

export interface VerificationResult {
  valid: boolean;
  payload?: TokenPayload;
  errorCode?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'REVOKED' | 'MALFORMED';
}
\`\`\`

**Implementation Breakdown:**
1. Task 1: \`src/security/jwt-validator.ts\` implementing \`verifyToken()\` with constant-time HMAC check.
2. Task 2: Automated test suite \`tests/jwt.test.mjs\` asserting all security edge cases.`,
  },
  {
    providerId: 'claude' as const,
    name: 'Claude (Auditor & Synthesizer)',
    role: 'Auditor & Synthesizer',
    content: `### [Turn 4: Consensus Synthesis & Final Decision Packet]

**Consensus Audit:**
Quorum achieved across all participating models. All security constraints, timing-safe checks, and test requirements are agreed upon.

Synthesizing final implementation plan into Schema 1.0 Decision Packet:

\`\`\`json
{
  "version": "1.0",
  "title": "Zero-Trust JWT Token Engine with Timing-Safe Verification",
  "summary": "Implement high-security JWT verification engine with constant-time signature comparison, rate limiting, and comprehensive automated test suite.",
  "decisions": [
    "Enforce algorithm pinning to HS256 to prevent algorithm confusion attacks",
    "Use crypto.timingSafeEqual on normalized byte buffers to eliminate timing side-channels",
    "Enforce maximum 5-second clock skew tolerance on token expiration",
    "Provide bounded in-memory token revocation cache with TTL pruning"
  ],
  "tasks": [
    {
      "id": "task-jwt-engine",
      "title": "Implement Core JWT Validator & Revocation Cache",
      "files": ["src/security/jwt-validator.ts", "src/security/revocation-store.ts"],
      "description": "Create timing-safe HMAC-SHA256 signature verifier with strict claim validation and bounded revocation set.",
      "testCommand": "node --test tests/*.test.mjs"
    },
    {
      "id": "task-jwt-tests",
      "title": "Implement Automated Security & Boundary Test Suite",
      "files": ["tests/jwt.test.mjs"],
      "description": "Write comprehensive unit tests covering valid tokens, expired tokens, tampered signatures, and timing attack resistance.",
      "testCommand": "node --test tests/*.test.mjs"
    }
  ],
  "criteria": [
    "All 90 automated quality and security tests pass cleanly in under 5 seconds",
    "Zero timing discrepancies detectable on invalid signature verification",
    "Cryptographic approval signature verified prior to local execution"
  ],
  "unresolvedRisks": [
    "Distributed Redis backend can be added in Phase 2 for multi-node deployments"
  ]
}
\`\`\``,
  },
];

export const SHOWCASE_DECISION_PACKET: DecisionPacket = {
  version: '1.0',
  title: 'Zero-Trust JWT Token Engine with Timing-Safe Verification',
  summary:
    'Implement high-security JWT verification engine with constant-time signature comparison, rate limiting, and comprehensive automated test suite.',
  decisions: [
    'Enforce algorithm pinning to HS256 to prevent algorithm confusion attacks',
    'Use crypto.timingSafeEqual on normalized byte buffers to eliminate timing side-channels',
    'Enforce maximum 5-second clock skew tolerance on token expiration',
    'Provide bounded in-memory token revocation cache with TTL pruning',
  ],
  tasks: [
    {
      id: 'task-jwt-engine',
      title: 'Implement Core JWT Validator & Revocation Cache',
      files: ['src/security/jwt-validator.ts', 'src/security/revocation-store.ts'],
      description:
        'Create timing-safe HMAC-SHA256 signature verifier with strict claim validation and bounded revocation set.',
      testCommand: 'node --test tests/*.test.mjs',
    },
    {
      id: 'task-jwt-tests',
      title: 'Implement Automated Security & Boundary Test Suite',
      files: ['tests/jwt.test.mjs'],
      description:
        'Write comprehensive unit tests covering valid tokens, expired tokens, tampered signatures, and timing attack resistance.',
      testCommand: 'node --test tests/*.test.mjs',
    },
  ],
  criteria: [
    'All 90 automated quality and security tests pass cleanly in under 5 seconds',
    'Zero timing discrepancies detectable on invalid signature verification',
    'Cryptographic approval signature verified prior to local execution',
  ],
  unresolvedRisks: [
    'Distributed Redis backend can be added in Phase 2 for multi-node deployments',
  ],
};

export const SHOWCASE_STRUCTURED_REVIEW: StructuredReview = {
  schemaVersion: '1.0',
  providerId: 'gemini',
  role: 'SQAT Quality & Security Auditor',
  verdict: 'PASS',
  summary:
    'Autonomous execution verified: All 90 automated unit & security tests executed successfully (0 failures). Zero regressions detected.',
  findings: [],
  evidenceReferences: [
    'Exit Code: 0 (Success)',
    'Automated Test Suite: 90 / 90 tests passing (4.3s duration)',
    'Security Policy: Zero shell injection or path traversal attempts detected',
    'Cryptographic Approval: Valid SHA-256 HMAC signature verified',
  ],
  requiredCorrections: [],
  riskLevel: 'low',
  confidence: 0.99,
  missingEvidence: [],
  timestamp: new Date().toISOString(),
};

export const SHOWCASE_BANGLA_DEFAULT_IDEA =
  'নিরাপদ জিরো-ট্রাস্ট JWT অথেনটিকেশন ও টোকেন বাতিল ইঞ্জিন তৈরি করো যা কনস্ট্যান্ট-টাইম সিগনেচার যাচাই, রেট লিমিটিং ও স্বয়ংক্রিয় টেস্ট নিশ্চিত করবে';

export const SHOWCASE_BANGLA_TURNS = [
  {
    providerId: 'chatgpt' as const,
    name: 'ChatGPT (লিড আর্কিটেক্ট)',
    role: 'লিড আর্কিটেক্ট (Lead Architect)',
    content: `### [টার্ন ১: লিড আর্কিটেক্টের প্রস্তাবনা ও সিস্টেম ডিজাইন]

**সিস্টেম ডিকম্পোজিশন ও মূল আর্কিটেকচার:**
আমরা OWASP টপ ১০ এপিআই সিকিউরিটি স্ট্যান্ডার্ড মেনে একটি জিরো-ট্রাস্ট JWT অথেনটিকেশন ও টোকেন রেভোকেশন সিস্টেম ডিজাইন করছি।

১. **মডুলার কম্পোনেন্ট কাঠামো:**
   - \`TokenEngine\`: ক্রিপ্টোগ্রাফিক টোকেন তৈরি, ক্লেইম পার্সিং ও সিগনেচার ভ্যালিডেশন।
   - \`RevocationStore\`: মেমরি-সেফ ব্ল্যাকলিস্ট ক্যাশ যা ইউজার লগআউট করলে সাথে সাথে টোকেন বাতিল করে।
   - \`RateLimiter\`: ব্রুট-ফোর্স অ্যাটাক ঠেকাতে টোকেন-বাকেট রেট লিমিটার (প্রতি আইপিতে সর্বোচ্চ ১০০ ভেরিফিকেশন/সেকেন্ড)।

২. **মূল সিকিউরিটি সিদ্ধান্ত:**
   - অ্যালগরিদম পিনিং (HS256) বাধ্যতামূলক করা, যাতে কোনো হ্যাকার 'alg: none' বা সিগনেচার বাইপাস আক্রমণ না করতে পারে।
   - সব HMAC ডাইজেস্ট তুলনায় Node.js \`crypto.timingSafeEqual\` ব্যবহার করা, যাতে কোনো টাইমিং সাইড-চ্যানেল হ্যাক সম্ভব না হয়।

৩. **কোয়ালিটি ও গ্রহণযোগ্যতার মাপকাঠি:**
   - টোকেন ভ্যালিডেশনের প্রতিটি সীমানায় ১০০% টেস্ট অ্যাসারশন নিশ্চিত করা।
   - মেয়াদোত্তীর্ণ বা ম্যানিপুলেট করা টোকেনে আনহ্যান্ডলড এক্সেপশন শূন্য রাখা।`,
  },
  {
    providerId: 'gemini' as const,
    name: 'Gemini (সিকিউরিটি ও ফিজিবিলিটি)',
    role: 'সিকিউরিটি ও ফিজিবিলিটি অডিটর',
    content: `### [টার্ন ২: সিকিউরিটি অডিট ও বাস্তবায়ন ফিজিবিলিটি]

**ক্রিপ্টোগ্রাফিক ভেরিফিকেশন ও সেফটি অডিট:**
আমি ChatGPT-এর প্রস্তাবিত আর্কিটেকচার পর্যালোচনা করেছি।

১. **টাইমিং অ্যাটাক প্রতিরোধ:**
   - \`crypto.timingSafeEqual\` ব্যবহারের সাথে একমত। অত্যন্ত গুরুত্বপূর্ণ বিষয়: তুলনার আগে উভয় বাফারের বাইট দৈর্ঘ্য অবশ্যই সমান হতে হবে; অন্যথায় দৈর্ঘ্যের পার্থক্য থেকে সময় গণনা করে আক্রমণ সম্ভব।
   - সার্ভারগুলোর সময়ের ব্যবধানের কারণে যাতে ভুল না হয়, তাই \`nbf\` এবং \`exp\` এর জন্য সর্বোচ্চ ৫ সেকেন্ডের ক্লক স্কিউ টলারেন্স (Clock Skew Tolerance) রাখতে হবে।

২. **মেমরি সেফটি ও DoS প্রতিরোধ:**
   - বাতিল টোকেনের তালিকায় একটি সর্বোচ্চ সীমা (৫০,০০০ আইটেম) ও LRU ক্যাশ ইভিকশন রাখতে হবে, যাতে মেমরি শেষ হয়ে সার্ভার ক্র্যাশ না করে।

৩. **স্বয়ংক্রিয় টেস্টের বাধ্যবাধকতা:**
   - টেস্ট স্যুটে নিম্নোক্ত কেসগুলো ১০০% পাস করতে হবে:
     * সঠিক টোকেন অনুমোদন (Happy Path)
     * জাল বা পরিবর্তিত সিগনেচার শনাক্ত ও প্রত্যাখ্যান
     * মেয়াদোত্তীর্ণ টোকেন স্বয়ংক্রিয় বাতিল`,
  },
  {
    providerId: 'deepseek' as const,
    name: 'DeepSeek (কোড স্পেসিফিকেশন)',
    role: 'কোড স্পেক স্পেশালিস্ট',
    content: `### [টার্ন ৩: টেকনিক্যাল ইন্টারফেস ও টাইপস্ক্রিপ্ট স্পেক]

**টাইপ কনট্রাক্ট ও ইন্টারফেস স্পেসিফিকেশন:**
Gemini-এর ক্রিপ্টোগ্রাফিক পরামর্শের ভিত্তিতে টাইপ-সেফ ইন্টারফেস নিচে দেওয়া হলো:

\`\`\`typescript
export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  roles: string[];
}

export interface VerificationResult {
  valid: boolean;
  payload?: TokenPayload;
  errorCode?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'REVOKED' | 'MALFORMED';
}
\`\`\`

**বাস্তবায়ন পরিকল্পনা:**
১. টাস্ক ১: \`src/security/jwt-validator.ts\` — কনস্ট্যান্ট-টাইম HMAC চেকসহ \`verifyToken()\` তৈরি করা।
২. টাস্ক ২: \`tests/jwt.test.mjs\` — সব সিকিউরিটি এজ-কেস কাভার করে ৯০টি টেস্ট পাস করানো।`,
  },
  {
    providerId: 'claude' as const,
    name: 'Claude (সিন্থেসাইজার ও অডিটর)',
    role: 'চূড়ান্ত অডিটর ও সিন্থেসাইজার',
    content: `### [টার্ন ৪: কনসেনসাস সিন্থেসিস ও ডিসিশন প্যাকেট ১.০]

**কনসেনসাস অডিট রিপোর্ট:**
সকল অংশগ্রহণকারী মডেলের মধ্যে পূর্ণ সম্মতি (Quorum Achieved) অর্জিত হয়েছে। সমস্ত নিরাপত্তা বিধিনিষেধ ও টেস্ট বাধ্যবাধকতা গৃহীত।

চূড়ান্ত বাস্তবায়ন পরিকল্পনা স্কিমা ১.০ ডিসিশন প্যাকেটে সিন্থেসাইজ করা হলো:

\`\`\`json
{
  "version": "1.0",
  "title": "জিরো-ট্রাস্ট JWT টোকেন ইঞ্জিন (কনস্ট্যান্ট-টাইম ভেরিফিকেশন সহ)",
  "summary": "টাইমিং-সেফ সিগনেচার যাচাই, রেট লিমিটিং ও মেমরি-বাউন্ডেড টোকেন বাতিল ক্যাশ সহ উচ্চ-নিরাপত্তাসম্পন্ন JWT ইঞ্জিন ও টেস্ট স্যুট বাস্তবায়ন।",
  "decisions": [
    "অ্যালগরিদম কনফিউশন অ্যাটাক রুখতে HS256 অ্যালগরিদম পিনিং নিশ্চিত করা",
    "টাইমিং সাইড-চ্যানেল হ্যাক বন্ধে crypto.timingSafeEqual ব্যবহার করা",
    "টোকেন মেয়াদের জন্য সর্বোচ্চ ৫ সেকেন্ডের ক্লক স্কিউ টলারেন্স রাখা",
    "মেমরি ওভারফ্লো ঠেকাতে মেমরি-বাউন্ডেড টোকেন ব্ল্যাকলিস্ট ক্যাশ রাখা"
  ],
  "tasks": [
    {
      "id": "task-jwt-engine",
      "title": "কোর JWT ভ্যালিডেটর ও রেভোকেশন ক্যাশ তৈরি",
      "files": ["src/security/jwt-validator.ts", "src/security/revocation-store.ts"],
      "description": "টাইমিং-সেফ HMAC-SHA256 সিগনেচার ভেরিফায়ার এবং মেমরি-বাউন্ডেড রেভোকেশন ক্যাশ ইমপ্লিমেন্ট করা।",
      "testCommand": "node --test tests/*.test.mjs"
    },
    {
      "id": "task-jwt-tests",
      "title": "স্বয়ংক্রিয় সিকিউরিটি ও বাউন্ডারি টেস্ট স্যুট",
      "files": ["tests/jwt.test.mjs"],
      "description": "বৈধ টোকেন, মেয়াদোত্তীর্ণ টোকেন, ট্যাম্পার করা সিগনেচার ও টাইমিং অ্যাটাক রেজিস্ট্যান্স যাচাই করার পূর্ণাঙ্গ ইউনিট টেস্ট।",
      "testCommand": "node --test tests/*.test.mjs"
    }
  ],
  "criteria": [
    "সকল ৯০টি স্বয়ংক্রিয় টেস্ট ৫ সেকেন্ডের মধ্যে ত্রুটিহীনভাবে পাস হতে হবে",
    "ইনভ্যালিড সিগনেচার ভেরিফিকেশনে শূন্য টাইমিং তারতম্য থাকতে হবে",
    "লোকাল এক্সিকিউশনের পূর্বে ক্রিপ্টোগ্রাফিক HMAC ডিজিটাল অনুমোদন নিশ্চিত করা"
  ],
  "unresolvedRisks": [
    "ভবিষ্যতে মাল্টি-নোড ক্লাউড ডিপ্লয়মেন্টের জন্য Redis ব্যাকএন্ড যুক্ত করা যাবে"
  ]
}
\`\`\``,
  },
];

export const SHOWCASE_BANGLA_DECISION_PACKET: DecisionPacket = {
  version: '1.0',
  title: 'জিরো-ট্রাস্ট JWT টোকেন ইঞ্জিন (কনস্ট্যান্ট-টাইম ভেরিফিকেশন সহ)',
  summary:
    'টাইমিং-সেফ সিগনেচার যাচাই, রেট লিমিটিং ও মেমরি-বাউন্ডেড টোকেন বাতিল ক্যাশ সহ উচ্চ-নিরাপত্তাসম্পন্ন JWT ইঞ্জিন ও টেস্ট স্যুট বাস্তবায়ন।',
  decisions: [
    'অ্যালগরিদম কনফিউশন অ্যাটাক রুখতে HS256 অ্যালগরিদম পিনিং নিশ্চিত করা',
    'টাইমিং সাইড-চ্যানেল হ্যাক বন্ধে crypto.timingSafeEqual ব্যবহার করা',
    'টোকেন মেয়াদের জন্য সর্বোচ্চ ৫ সেকেন্ডের ক্লক স্কিউ টলারেন্স রাখা',
    'মেমরি ওভারফ্লো ঠেকাতে মেমরি-বাউন্ডেড টোকেন ব্ল্যাকলিস্ট ক্যাশ রাখা',
  ],
  tasks: [
    {
      id: 'task-jwt-engine',
      title: 'কোর JWT ভ্যালিডেটর ও রেভোকেশন ক্যাশ তৈরি',
      files: ['src/security/jwt-validator.ts', 'src/security/revocation-store.ts'],
      description:
        'টাইমিং-সেফ HMAC-SHA256 সিগনেচার ভেরিফায়ার এবং মেমরি-বাউন্ডেড রেভোকেশন ক্যাশ ইমপ্লিমেন্ট করা।',
      testCommand: 'node --test tests/*.test.mjs',
    },
    {
      id: 'task-jwt-tests',
      title: 'স্বয়ংক্রিয় সিকিউরিটি ও বাউন্ডারি টেস্ট স্যুট',
      files: ['tests/jwt.test.mjs'],
      description:
        'বৈধ টোকেন, মেয়াদোত্তীর্ণ টোকেন, ট্যাম্পার করা সিগনেচার ও টাইমিং অ্যাটাক রেজিস্ট্যান্স যাচাই করার পূর্ণাঙ্গ ইউনিট টেস্ট।',
      testCommand: 'node --test tests/*.test.mjs',
    },
  ],
  criteria: [
    'সকল ৯০টি স্বয়ংক্রিয় টেস্ট ৫ সেকেন্ডের মধ্যে ত্রুটিহীনভাবে পাস হতে হবে',
    'ইনভ্যালিড সিগনেচার ভেরিফিকেশনে শূন্য টাইমিং তারতম্য থাকতে হবে',
    'লোকাল এক্সিকিউশনের পূর্বে ক্রিপ্টোগ্রাফিক HMAC ডিজিটাল অনুমোদন নিশ্চিত করা',
  ],
  unresolvedRisks: [
    'ভবিষ্যতে মাল্টি-নোড ক্লাউড ডিপ্লয়মেন্টের জন্য Redis ব্যাকএন্ড যুক্ত করা যাবে',
  ],
};

export const SHOWCASE_BANGLA_STRUCTURED_REVIEW: StructuredReview = {
  schemaVersion: '1.0',
  providerId: 'gemini',
  role: 'SQAT কোয়ালিটি ও সিকিউরিটি অডিটর',
  verdict: 'PASS',
  summary:
    'স্বয়ংক্রিয় এক্সিকিউশন সফল: সকল ৯০টি টেস্ট ত্রুটিহীনভাবে পাস করেছে (০ ফেইলিওর)। কোনো ধরনের রিগ্রেশন বা ত্রুটি পাওয়া যায়নি।',
  findings: [],
  evidenceReferences: [
    'এক্সিট কোড: ০ (সফল)',
    'স্বয়ংক্রিয় টেস্ট স্যুট: ৯০ / ৯০ টেস্ট পাস (৪.৩ সেকেন্ড)',
    'সিকিউরিটি পলিসি: জিরো শেল ইনজেকশন বা পাথ ট্রাভার্সাল শনাক্ত',
    'ডিজিটাল অনুমোদন: ভ্যালিড SHA-256 ক্রিপ্টোগ্রাফিক সিগনেচার যাচাইকৃত',
  ],
  requiredCorrections: [],
  riskLevel: 'low',
  confidence: 0.99,
  missingEvidence: [],
  timestamp: new Date().toISOString(),
};
