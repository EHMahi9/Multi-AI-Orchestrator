import type { FindingSeverity, ProviderId, ReviewFinding, ReviewVerdictType, StructuredReview } from './types';
import { extractJsonFromText } from './schema';

export interface ReviewValidationResult {
  valid: boolean;
  errors: string[];
  review?: StructuredReview;
}

const VALID_VERDICTS = new Set<ReviewVerdictType>(['PASS', 'REVISION_REQUIRED', 'BLOCKED']);
const VALID_SEVERITIES = new Set<FindingSeverity>(['critical', 'high', 'medium', 'low', 'info']);
const VALID_RISKS = new Set(['low', 'medium', 'high', 'critical']);

/**
 * Validates that an untrusted object or parsed response strictly satisfies StructuredReview 1.0 schema.
 * Never treats malformed JSON as a valid PASS verdict.
 */
export function validateStructuredReview(
  input: unknown,
  providerId: ProviderId,
  role: string,
  rawText?: string
): ReviewValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Review payload must be a non-null object.'] };
  }

  const data = input as Record<string, any>;

  // schemaVersion check
  if (data.schemaVersion !== '1.0') {
    errors.push(`Invalid schemaVersion: expected "1.0", got "${data.schemaVersion}".`);
  }

  // verdict check
  if (!data.verdict || !VALID_VERDICTS.has(data.verdict as ReviewVerdictType)) {
    errors.push(`Invalid verdict: expected one of ${Array.from(VALID_VERDICTS).join(', ')}, got "${data.verdict}".`);
  }

  // summary check
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    errors.push('Field "summary" must be a non-empty string.');
  }

  // findings check
  const validatedFindings: ReviewFinding[] = [];
  if (!Array.isArray(data.findings)) {
    errors.push('Field "findings" must be an array.');
  } else {
    data.findings.forEach((f: any, idx: number) => {
      if (!f || typeof f !== 'object') {
        errors.push(`Finding at index ${idx} must be an object.`);
        return;
      }
      if (typeof f.id !== 'string' || !f.id.trim()) {
        errors.push(`Finding at index ${idx} is missing a valid "id".`);
      }
      if (!VALID_SEVERITIES.has(f.severity as FindingSeverity)) {
        errors.push(
          `Finding at index ${idx} has invalid severity "${f.severity}". Allowed: ${Array.from(VALID_SEVERITIES).join(', ')}.`
        );
      }
      if (typeof f.description !== 'string' || !f.description.trim()) {
        errors.push(`Finding at index ${idx} is missing a non-empty "description".`);
      }
      if (typeof f.recommendedAction !== 'string' || !f.recommendedAction.trim()) {
        errors.push(`Finding at index ${idx} is missing a non-empty "recommendedAction".`);
      }

      validatedFindings.push({
        id: String(f.id || `FINDING-${idx + 1}`).trim(),
        severity: (VALID_SEVERITIES.has(f.severity) ? f.severity : 'medium') as FindingSeverity,
        description: String(f.description || '').trim(),
        evidenceReferences: Array.isArray(f.evidenceReferences) ? f.evidenceReferences.map((e: any) => String(e).trim()) : [],
        reproducible: Boolean(f.reproducible),
        recommendedAction: String(f.recommendedAction || '').trim(),
      });
    });
  }

  // evidenceReferences check
  const evidenceReferences = Array.isArray(data.evidenceReferences)
    ? data.evidenceReferences.map((e: any) => String(e).trim())
    : [];

  // requiredCorrections check
  const requiredCorrections = Array.isArray(data.requiredCorrections)
    ? data.requiredCorrections.map((c: any) => String(c).trim())
    : [];

  // riskLevel check
  const riskLevel = VALID_RISKS.has(data.riskLevel) ? data.riskLevel : 'medium';

  // confidence check
  let confidence = typeof data.confidence === 'number' ? data.confidence : 0.5;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  // missingEvidence check
  const missingEvidence = Array.isArray(data.missingEvidence)
    ? data.missingEvidence.map((m: any) => String(m).trim())
    : [];

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const review: StructuredReview = {
    schemaVersion: '1.0',
    providerId,
    role,
    verdict: data.verdict as ReviewVerdictType,
    summary: data.summary.trim(),
    findings: validatedFindings,
    evidenceReferences,
    requiredCorrections,
    riskLevel: riskLevel as 'low' | 'medium' | 'high' | 'critical',
    confidence,
    missingEvidence,
    timestamp: new Date().toISOString(),
    rawText,
  };

  return { valid: true, errors: [], review };
}

/**
 * Parses raw provider text response into a validated StructuredReview.
 */
export function parseAndValidateReview(
  rawText: string,
  providerId: ProviderId,
  role: string
): ReviewValidationResult {
  const extracted = extractJsonFromText(rawText);
  if (!extracted.ok || !extracted.data) {
    return {
      valid: false,
      errors: [`Failed to extract review JSON from provider ${providerId}: ${extracted.error || 'No JSON found'}`],
    };
  }

  return validateStructuredReview(extracted.data, providerId, role, rawText);
}
