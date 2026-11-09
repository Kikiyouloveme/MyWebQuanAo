/** Stable, unambiguous identity across regular items and design revisions. */
export function cartLineKey(variantId, revisionId) {
  return JSON.stringify(revisionId ? ['custom', variantId, revisionId] : ['regular', variantId]);
}
