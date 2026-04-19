/**
 * Boot-time environment validation.
 *
 * Each service declares which variables it needs via `validateEnv(['JWT_ACCESS_SECRET', …])`
 * and the process aborts with a clear message if anything required is missing
 * or obviously wrong. This replaces silent `undefined` secrets that used to
 * surface only at the first authenticated request.
 */

export interface EnvRule {
  /** Variable name. */
  name: string;
  /** Reject values shorter than this (defaults applied per rule set below). */
  minLength?: number;
  /** Must match this regex if supplied. */
  pattern?: RegExp;
  /** Skip validation in this NODE_ENV — useful for test/dev-only locals. */
  optionalIn?: string[];
}

/** Shared secrets every service that validates JWTs must have. */
export const JWT_RULES: EnvRule[] = [
  { name: 'JWT_ACCESS_SECRET', minLength: 32 },
  { name: 'JWT_REFRESH_SECRET', minLength: 32 },
];

/** Mongo / Redis / Kafka wiring required by every data-plane service. */
export const INFRA_RULES: EnvRule[] = [
  { name: 'MONGO_URI', minLength: 10 },
  { name: 'MONGO_DB', minLength: 1 },
  { name: 'REDIS_HOST', minLength: 1 },
  { name: 'REDIS_PORT', pattern: /^\d+$/ },
  { name: 'REDIS_PASSWORD', minLength: 1, optionalIn: ['test'] },
  { name: 'KAFKA_BROKER', minLength: 3 },
];

/**
 * Validate that every rule is satisfied by `process.env`. Throws with a
 * combined message listing every missing/invalid var.
 */
export function validateEnv(rules: EnvRule[]): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const errors: string[] = [];

  for (const rule of rules) {
    if (rule.optionalIn?.includes(nodeEnv)) continue;

    const value = process.env[rule.name];
    if (value === undefined || value === '') {
      errors.push(`${rule.name} is required`);
      continue;
    }

    const minLength = rule.minLength ?? 1;
    if (value.length < minLength) {
      errors.push(
        `${rule.name} is too short (got ${value.length} chars, need ≥ ${minLength})`,
      );
      continue;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${rule.name} does not match required pattern`);
    }
  }

  if (errors.length) {
    throw new Error(
      `Environment validation failed:\n  - ${errors.join('\n  - ')}`,
    );
  }
}
