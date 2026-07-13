const STATUS_RANK = Object.freeze({ error: 0, attention: 1, ok: 2 });

export function orderOperationsHealthChecks(checks = []) {
  return checks
    .map((check, index) => ({ check, index }))
    .sort((left, right) => (
      (STATUS_RANK[left.check?.status] ?? STATUS_RANK.ok)
      - (STATUS_RANK[right.check?.status] ?? STATUS_RANK.ok)
      || left.index - right.index
    ))
    .map(item => item.check);
}
