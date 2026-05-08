/**
 * Shared topic helpers for pimco lifecycle events.
 *
 * Used by both the RenderMaster (to dispatch incoming events to subscribers)
 * and the slaves (to decide whether to do the createImageBitmap copy at all).
 *
 * Topic format:
 *   pimcoRender:{pimcoId}              — emitted with the final per-layer bitmap
 *   pimcoRenderPart:{pimcoId}:{part}   — emitted per intermediate stage
 *
 * Subscription patterns may use `*` to match any single segment. Segment
 * counts must match exactly; there is no multi-segment wildcard.
 */

/**
 * Build the topic string for a PimcoEventMessage's structured fields.
 *   stage='render',     pimcoId='abc'              -> 'pimcoRender:abc'
 *   stage='render-part',pimcoId='abc', part='text' -> 'pimcoRenderPart:abc:text'
 *
 * If `part` is missing on a 'render-part' event the topic falls back to '?'
 * so subscribers using a wildcard segment still match; misshaped events from
 * a slave should be loud rather than silent.
 */
export function buildEventTopic(
  stage: 'render' | 'render-part',
  pimcoId: string,
  part?: string
): string {
  if (stage === 'render') {
    return `pimcoRender:${pimcoId}`;
  }
  return `pimcoRenderPart:${pimcoId}:${part ?? '?'}`;
}

/**
 * Match a subscription pattern against an event topic, segment-by-segment
 * split on `:`. `*` matches any single segment. Segment counts must match
 * exactly — there is no multi-segment wildcard.
 */
export function matchEventTopic(pattern: string, topic: string): boolean {
  const patSegments = pattern.split(':');
  const topSegments = topic.split(':');
  if (patSegments.length !== topSegments.length) {
    return false;
  }
  for (let i = 0; i < patSegments.length; i++) {
    const pat = patSegments[i];
    if (pat !== '*' && pat !== topSegments[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Predicate: would emitting `topic` reach at least one of the given
 * subscription patterns? Slave-side gate before doing expensive work
 * (createImageBitmap) for an event that nobody is listening for.
 */
export function topicHasSubscriber(topic: string, patterns: readonly string[]): boolean {
  for (const pattern of patterns) {
    if (matchEventTopic(pattern, topic)) {
      return true;
    }
  }
  return false;
}
