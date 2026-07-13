export async function settleAdminMutations(items, mutate, concurrency = 4) {
  if (!Array.isArray(items)) throw new Error('Bulk operation items must be an array.');
  if (typeof mutate !== 'function') throw new Error('Bulk operation requires a mutation function.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error('Bulk operation concurrency must be between 1 and 10.');
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await mutate(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  ));
  return results;
}
