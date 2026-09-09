/** Immutable state helpers shared by the kit and its consumers. */
export function sortRows(rows, columns, sort) {
  const column = columns.find(column => column.key === sort?.key && column.sortable);
  if (!column) return [...rows];
  const value = column.sortValue || (row => row[column.key]);
  return [...rows].sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    const comparison = typeof av === 'number' && typeof bv === 'number'
      ? av - bv : String(av).localeCompare(String(bv), undefined, {numeric:true});
    return sort.direction === 'descending' ? -comparison : comparison;
  });
}

export function nextSort(sort, key) {
  if (sort?.key !== key) return {key, direction:'ascending'};
  return sort.direction === 'ascending' ? {key, direction:'descending'} : null;
}

export function toggleSelection(selectedKeys, keys, checked) {
  const next = new Set(selectedKeys);
  for (const key of keys) checked ? next.add(key) : next.delete(key);
  return next;
}

export function selectionSummary(selectedKeys, resultKeys) {
  const keys = new Set(resultKeys);
  const visible = [...selectedKeys].filter(key => keys.has(key)).length;
  return {total:selectedKeys.size, visible, outside:selectedKeys.size-visible,
    all:keys.size > 0 && visible === keys.size, partial:visible > 0 && visible < keys.size};
}

export function readFilterValues(search, fields) {
  const params = new URLSearchParams(search);
  return Object.fromEntries(fields.map(field => {
    const value = params.get(field.key) || '';
    return [field.key, !field.options || field.options.some(option => option.value === value) ? value : ''];
  }));
}

export function writeFilterValues(search, values, fields) {
  const params = new URLSearchParams(search);
  for (const {key} of fields) {
    if (values[key]) params.set(key, values[key]);
    else params.delete(key);
  }
  return params.toString();
}

/** Offsets are measured CSS pixels; selection has no role in mounting rows. */
export function virtualWindow(keys, heights, {scrollTop, viewportHeight, estimate, overscan = 3, focusedKey = null}) {
  const offsets = [0];
  for (const key of keys) offsets.push(offsets.at(-1) + (heights.get(key) || estimate));
  let first = 0;
  while (first < keys.length && offsets[first+1] <= scrollTop) first++;
  let last = first;
  while (last < keys.length && offsets[last] < scrollTop + viewportHeight) last++;
  const indices = [];
  for (let i = Math.max(0, first-overscan); i < Math.min(keys.length, last+overscan); i++) indices.push(i);
  const focusedIndex = focusedKey == null ? -1 : keys.indexOf(focusedKey);
  if (focusedIndex >= 0 && !indices.includes(focusedIndex)) indices.push(focusedIndex);
  indices.sort((a,b) => a-b);
  return {indices, offsets, totalHeight:offsets.at(-1)};
}
