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
    page += 1;
  } while (rows.length < result.total && result.rows.length > 0);
  return rows;
}
