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
