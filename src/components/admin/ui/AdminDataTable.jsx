import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {nextSort, selectionSummary, sortRows, toggleSelection, virtualWindow} from './model.mjs';
import {AdminEmptyState, AdminSkeleton} from './primitives';
import {kitTokens} from './kitTokens.mjs';

const getId = row => row.id;
const getLabel = row => row.name ?? row.id;
const EMPTY = [];
const threshold = kitTokens['table.threshold'];
const estimate = kitTokens['table.estimate'];
const overscan = kitTokens['table.overscan'];

function SelectionBox({label, checked, mixed = false, disabled = false, onChange}) {
  const ref = useRef(null);
  useEffect(() => {if (ref.current) ref.current.indeterminate = mixed;}, [mixed]);
  return <label className="admin-table-check"><input ref={ref} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} /></label>;
}

function MeasuredRow({rowKey, measure, generation, children, ...props}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!measure) return;
    const node = ref.current;
    const update = () => measure(rowKey, node.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rowKey,measure,generation]);
  return <tr ref={ref} role="row" data-row-key={rowKey} {...props}>{children}</tr>;
}

function TableSkeleton({columns, selectable}) {
  const selection = <span className="admin-table-check" data-skeleton-selection=""><AdminSkeleton decorative className="admin-table-skeleton-check" /></span>;
  return <div data-table-loading="" className="admin-table-scroll" aria-hidden="true">
    <table className="admin-data-table">
      <thead className="admin-table-head"><tr>
        {selectable && <th className="admin-selection-heading">{selection}</th>}
        {columns.map(column => <th key={column.key}>{column.header}</th>)}
      </tr></thead>
      <tbody>{[0,1,2].map(index => <tr key={index} data-skeleton-row="">
        {selectable && <td className="admin-selection-cell">{selection}</td>}
        {columns.map(column => <td key={column.key} data-skeleton-cell={column.key}>
          <span className="admin-cell-label">{column.header}</span>
          <div className="admin-cell-value">{column.renderSkeleton ? column.renderSkeleton() : <AdminSkeleton decorative />}</div>
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

/**
 * Header selection covers the supplied rows. Server-paged consumers must name that scope with selectAllLabel.
 * selectedKeys/sort undefined => local state; supplied Set/null => controlled.
 * Large lists measure mounted rows and retain the focused stable-key node.
 * Full-results mode exposes every action in normal document tab order.
 * Optional column.renderSkeleton matches richer cells during loading; the default retains column geometry.
 */
export function AdminDataTable({rows = EMPTY, columns = EMPTY, getRowKey = getId, getRowLabel = getLabel, label = 'Records',
  selectable = false, selectedKeys = undefined, defaultSelectedKeys = EMPTY, onSelectionChange = undefined,
  selectAllLabel = 'Select all filtered results', selectionDisabled = false,
  sort = undefined, defaultSort = null, onSortChange = undefined, loading = false, error = null, onRetry = undefined,
  emptyTitle = 'No results', emptyDescription = 'Try changing your filters or adding a record.', emptyAction = null}) {
  const [localSelected, setLocalSelected] = useState(() => new Set(defaultSelectedKeys));
  const [localSort, setLocalSort] = useState(defaultSort);
  const [fullResults, setFullResults] = useState(false);
  const [focusedKey, setFocusedKey] = useState(null);
  const [heights, setHeights] = useState(() => new Map());
  const [generation, setGeneration] = useState(0);
  const [viewport, setViewport] = useState({scrollTop:0,height:estimate});
  const scrollRef = useRef(null), containerRef = useRef(null), textMeasureRef = useRef(null), headRef = useRef(null);
  const selected = selectedKeys === undefined ? localSelected : new Set(selectedKeys || []);
  const currentSort = sort === undefined ? localSort : sort;
  const sorted = useMemo(() => sortRows(rows,columns,currentSort), [rows,columns,currentSort]);
  const keys = useMemo(() => sorted.map(getRowKey), [sorted,getRowKey]);
  const signature = JSON.stringify(keys);
  const virtualized = rows.length > threshold && !fullResults;
  const summary = selectionSummary(selected, keys);
  const window = virtualWindow(keys,heights,{scrollTop:viewport.scrollTop,viewportHeight:viewport.height,estimate,overscan,focusedKey});
  const indices = virtualized ? window.indices : keys.map((_,index) => index);
  const measure = useCallback((key,height) => {
    if (height <= 0) return;
    setHeights(previous => {
      if (Math.abs((previous.get(key) || 0)-height) < 0.5) return previous;
      const next = new Map(previous); next.set(key,height); return next;
    });
  }, []);
  const readViewport = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const headerHeight = headRef.current?.getBoundingClientRect().height || 0;
    setViewport({scrollTop:Math.max(0,node.scrollTop-headerHeight),height:node.clientHeight});
  }, []);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = 0;
    readViewport();
  }, [signature,readViewport]);
  useEffect(() => {
    if (focusedKey != null && !keys.includes(focusedKey)) {
      scrollRef.current?.focus();
      setFocusedKey(null);
    }
  }, [keys,focusedKey]);
  useEffect(() => {
    if (!virtualized) return;
    const container = containerRef.current, node = scrollRef.current;
    if (!container || !node) return;
    let previousSignature = '';
    const invalidate = () => {
      const nextSignature = `${container.clientWidth}:${textMeasureRef.current?.getBoundingClientRect().height}:${container.closest('[data-density]')?.getAttribute('data-density')}`;
      if (nextSignature !== previousSignature) {
        previousSignature = nextSignature;
        setHeights(new Map());
        setGeneration(value => value+1);
      }
      readViewport();
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(container); observer.observe(node);
    if (textMeasureRef.current) observer.observe(textMeasureRef.current);
    const mutations = new MutationObserver(invalidate);
    for (let ancestor = container; ancestor; ancestor = ancestor.parentElement) mutations.observe(ancestor,{attributes:true,attributeFilter:['class','style','data-density']});
    invalidate();
    return () => {observer.disconnect(); mutations.disconnect();};
  }, [virtualized,readViewport,loading,error]);
  function select(keysToChange, checked) {
    if (selectionDisabled) return;
    const next = toggleSelection(selected,keysToChange,checked);
    if (selectedKeys === undefined) setLocalSelected(next);
    onSelectionChange?.(next);
  }
  function changeSort(key) {
    const next = nextSort(currentSort,key);
    if (sort === undefined) setLocalSort(next);
    onSortChange?.(next);
  }
  const columnCount = columns.length + (selectable ? 1 : 0);
  const body = [];
  let previousIndex = -1;
  function spacer(from, to) {
    if (to <= from) return;
    body.push(<tr key={`spacer-${from}-${to}`} role="presentation" aria-hidden="true" className="admin-table-spacer"><td colSpan={columnCount} style={{height:window.offsets[to]-window.offsets[from]}} /></tr>);
  }
  for (const index of indices) {
    const row = sorted[index], key = keys[index];
    if (virtualized) spacer(previousIndex+1,index);
    body.push(<MeasuredRow key={key} rowKey={key} measure={virtualized ? measure : null} generation={generation} aria-rowindex={index+2} aria-selected={selectable ? selected.has(key) : undefined}
      onFocusCapture={() => setFocusedKey(key)}>
      {selectable && <td role="cell" className="admin-selection-cell"><SelectionBox label={`Select ${getRowLabel(row)}`} checked={selected.has(key)} disabled={selectionDisabled} onChange={event => select([key],event.target.checked)} /></td>}
      {columns.map(column => <td role="cell" key={column.key}><span className="admin-cell-label" aria-hidden="true">{column.header}</span><div className="admin-cell-value">{column.render ? column.render(row) : row[column.key] ?? '—'}</div></td>)}
    </MeasuredRow>);
    previousIndex = index;
  }
  if (virtualized) spacer(previousIndex+1,keys.length);
  return <section ref={containerRef} className="admin-kit-container admin-table-container" data-admin-table="" data-virtualized={virtualized} aria-label={label} aria-busy={loading}>
    <span ref={textMeasureRef} aria-hidden="true" className="admin-table-text-measure" />
    <div className="admin-table-toolbar">
      <p role="status" aria-live="polite">{loading ? `Loading ${label.toLowerCase()}…` : selectable ? `${summary.total} selected (${summary.outside} outside current results)` : `${rows.length} results`}</p>
      {rows.length > threshold && <button type="button" className="admin-kit-button" aria-pressed={fullResults} onClick={() => setFullResults(value => !value)}>{fullResults ? 'Use virtual scrolling' : `Show all ${rows.length} results for keyboard navigation`}</button>}
    </div>
    {loading ? <TableSkeleton columns={columns} selectable={selectable} />
      : error ? <div role="alert"><AdminEmptyState title="Unable to load records" description={typeof error === 'string' ? error : error.message || 'Please try again.'} action={onRetry && <button type="button" className="admin-kit-button" onClick={onRetry}>Retry</button>} /></div>
      : rows.length === 0 ? <AdminEmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      : <div ref={scrollRef} data-table-scroll="" className="admin-table-scroll" tabIndex={0} aria-label={`${label} scroll area`} onScroll={readViewport}
        onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget)) setFocusedKey(null);}}>
        <table className="admin-data-table" role="table" aria-label={label} aria-rowcount={rows.length+1}>
          <thead ref={headRef} role="rowgroup" className="admin-table-head"><tr role="row" aria-rowindex={1}>
            {selectable && <th scope="col" role="columnheader" className="admin-selection-heading"><SelectionBox label={selectAllLabel} checked={summary.all} mixed={summary.partial} disabled={selectionDisabled} onChange={event => select(keys,event.target.checked)} /><span className="sr-only">Selection</span></th>}
            {columns.map(column => <th key={column.key} scope="col" role="columnheader" aria-sort={column.sortable ? currentSort?.key === column.key ? currentSort.direction : 'none' : undefined}>
              {column.sortable ? <button type="button" className="admin-table-sort" onClick={() => changeSort(column.key)}>{column.header}<span aria-hidden="true">{currentSort?.key === column.key ? currentSort.direction === 'ascending' ? ' ↑' : ' ↓' : ' ↕'}</span></button> : column.header}
            </th>)}
          </tr></thead><tbody role="rowgroup">{body}</tbody>
        </table>
      </div>}
  </section>;
}
