const DEFAULT_STYLE = { timing: 0, velocity: 0, swing: 0 };

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function createHumanizeContext({
  enabled = false,
  amount = 0,
  swing = 0,
  styleDefaults = DEFAULT_STYLE,
} = {}) {
  const clampedAmount = clamp(amount, 0, 1);
  const defaults = styleDefaults || DEFAULT_STYLE;
  return {
    enabled: Boolean(enabled) && (defaults.timing > 0 || defaults.velocity > 0 || defaults.swing > 0 || swing > 0),
    timingJitter: clampedAmount * (defaults.timing || 0),
    velocityRange: clampedAmount * (defaults.velocity || 0),
    swingAmount: clamp((defaults.swing || 0) + swing, 0, 0.5),
  };
}

export function applyHumanizeToBeat(startBeats, context, swingPosition = 0, rng = Math.random) {
  if (!context?.enabled) return startBeats;
  const swingOffset = computeSwingOffset(startBeats, context.swingAmount, swingPosition);
  const timingOffset = context.timingJitter ? sampleCentered(context.timingJitter, rng) : 0;
  return startBeats + swingOffset + timingOffset;
}

export function getHumanizedVelocity(baseVelocity = 0.85, context, rng = Math.random) {
  if (!context?.enabled || !context.velocityRange) return clamp(baseVelocity, 0, 1);
  const variation = sampleCentered(context.velocityRange, rng);
  return clamp(baseVelocity + variation, 0.2, 1);
}

export function scaleVelocityByDynamics(baseVelocity = 0.85, dynamics = {}) {
  const accent = clamp(dynamics?.accent ?? 0, 0, 0.6);
  const ghost = clamp(dynamics?.ghost ?? 0, 0, 0.9);
  const accentFactor = 1 + accent;
  const ghostFactor = 1 - ghost * 0.8;
  return clamp(baseVelocity * accentFactor * ghostFactor, 0.1, 1);
}

function computeSwingOffset(startBeats, swingAmount = 0, swingPosition = 0) {
  if (!swingAmount) return 0;
  const maxDelay = 0.15; // beats
  if (swingPosition) {
    return swingAmount * swingPosition * maxDelay;
  }
  const eighthPosition = startBeats / 0.5;
  const epsilon = 1e-3;
  if (Math.abs(eighthPosition - Math.round(eighthPosition)) > epsilon) return 0;
  const index = Math.round(eighthPosition);
  if (index % 2 === 1) {
    return swingAmount * maxDelay;
  }
  return 0;
}

function sampleCentered(range, rng) {
  if (!range) return 0;
  const random = typeof rng === "function" ? rng() : Math.random();
  return (random * 2 - 1) * range;
}

export function __private__() {
  return { computeSwingOffset, sampleCentered };
}
