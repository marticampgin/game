export function finishPlace(view, fall) {
  if (!fall?.place) return '';
  if (view.phase === 'finished' && !view.winnerId && fall.place === 1) return fall.tied ? 'Shared final elimination' : 'Final elimination';
  const suffix = ['th','st','nd','rd'][fall.place] || 'th';
  return (fall.tied ? 'Tied for ' : '') + fall.place + suffix + ' place';
}
