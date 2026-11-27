const visibleTypes = new Set(['damage', 'shield', 'heal', 'revival', 'elimination', 'status']);

export function directOutcome(event, recap) {
  return event.targetId === recap.targetId && event.timing !== 'turn' && event.timing !== 'round' &&
    (!event.actorId || event.actorId === recap.actorId);
}

// Take the public effects in resolution order. Reserve the actual contact even in
// a long cascade, so a pre-strike Bleed or a round transition cannot replace it.
export function combatTiming(recap, lead, reduced) {
  const all = (recap.events ?? []).filter(event => event.targetId && visibleTypes.has(event.type));
  const primary = recap.actionId === 'interrupted' ? all[0] : all.find(event => directOutcome(event, recap));
  const selected = new Set([primary, all[0]].filter(Boolean));
  for (const event of all) {
    if (selected.size < 6 && ['elimination', 'revival'].includes(event.type)) selected.add(event);
  }
  for (const event of all) if (selected.size < 6 && event.type !== 'status') selected.add(event);
  for (const event of all) if (selected.size < 6) selected.add(event);
  const events = all.filter(event => selected.has(event));

  // A strike with three prior effects needs time to show them while the weapon
  // comes up. Reactions to the hit begin on contact or later, in original order.
  const firstLater = events.findIndex(event => event.timing === 'turn' || event.timing === 'round');
  const before = primary ? events.indexOf(primary) : firstLater < 0 ? events.length : firstLater;
  const step = reduced ? 70 : Math.min(268, 810 / Math.max(1, events.length - 1));
  const spacingBefore = reduced ? 58 : 180;
  const contact = Math.max(lead, before * spacingBefore + (reduced ? 12 : 35));
  const beats = events.map((event, index) => ({
    event,
    time: index < before
      ? contact - (before - index) * spacingBefore
      : contact + (index - before + (primary ? 0 : 1)) * step,
  }));
  return { primary, beats, contact, windup: contact - lead, last: Math.max(contact, beats.at(-1)?.time ?? 0) };
}
