export async function collectAdminPages(fetchPage) {
  const rows = [];
  let page = 1;
  let result;
  do {
    result = await fetchPage(page);
    if (!Array.isArray(result?.rows) || !Number.isFinite(result?.total)) {
      throw new Error('Admin query returned an invalid page.');
    }
    rows.push(...result.rows);
    if (rows.length < result.total && result.rows.length === 0) {
      throw new Error(`Admin query stopped after ${rows.length} of ${result.total} rows.`);
    }
    page += 1;
  } while (rows.length < result.total);
  return rows;
}

export async function collectAdminBatches(fetchBatch, batchSize = 500) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error('Admin batch size must be between 1 and 1,000.');
  }
  const rows = [];
  let page = 1;
  while (true) {
    const batch = await fetchBatch(page, batchSize);
    if (!Array.isArray(batch)) throw new Error('Admin query returned an invalid batch.');
    rows.push(...batch);
    if (batch.length < batchSize) return rows;
    page += 1;
  }
}
