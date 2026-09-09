import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {readFilterValues, writeFilterValues} from './model.mjs';
import {AdminFormField} from './primitives';
import {kitTokens} from './kitTokens.mjs';

const NO_FILTERS = [];
/** Router-owned query writes keep route, hash and state; no workspace navigation. */
export function AdminFilterBar({queryKey = 'q', searchLabel = 'Search records', filters = NO_FILTERS, onChange = undefined, debounceMs = kitTokens['filter.debounce']}) {
  const location = useLocation(), navigate = useNavigate();
  // Inline option arrays from callers must not retrigger URL synchronization.
  const fieldSignature = JSON.stringify(filters.map(({key,options}) => ({key,options:options.map(({value}) => ({value}))})));
  const fields = useMemo(() => [{key:queryKey}, ...JSON.parse(fieldSignature)], [queryKey,fieldSignature]);
  const [draft, setDraft] = useState(() => readFilterValues(location.search, fields));
  const timer = useRef(null), latest = useRef({location,fields,navigate,onChange});
  latest.current = {location,fields,navigate,onChange};
  useEffect(() => {
    clearTimeout(timer.current);
    const values = readFilterValues(location.search, fields);
    setDraft(values);
    latest.current.onChange?.(values);
    return () => clearTimeout(timer.current);
  }, [location.key, location.search, fields]);
  function commit(values) {
    const {location:current,fields:owned,navigate:go} = latest.current;
    const search = writeFilterValues(current.search, values, owned);
    go({pathname:current.pathname,search:search ? `?${search}` : '',hash:current.hash}, {replace:true,state:current.state,preventScrollReset:true});
  }
  function change(key, value, typing = false) {
    const values = {...draft,[key]:value};
    setDraft(values);
    clearTimeout(timer.current);
    if (typing) timer.current = setTimeout(() => commit(values), debounceMs);
    else commit(values);
  }
  return <div className="admin-kit-container"><form className="admin-filter-controls" role="search" aria-label="Filter records" onSubmit={event => {event.preventDefault(); clearTimeout(timer.current); commit(draft);}}>
    <AdminFormField label={searchLabel}><input type="search" value={draft[queryKey] || ''} onChange={event => change(queryKey,event.target.value,true)} /></AdminFormField>
    {filters.map(field => <AdminFormField key={field.key} label={field.label}><select value={draft[field.key] || ''} onChange={event => change(field.key,event.target.value)}><option value="">All</option>{field.options.filter(option => option.value !== '').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></AdminFormField>)}
    <button type="button" className="admin-kit-button" onClick={() => {clearTimeout(timer.current); setDraft(readFilterValues('',fields)); commit({});}}>Reset filters</button>
  </form></div>;
}
