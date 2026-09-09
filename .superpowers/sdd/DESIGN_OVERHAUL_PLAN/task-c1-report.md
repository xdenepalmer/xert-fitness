# Task C1 — shared web Command Centre controls

Base: `ffa3b726c3d1819a374d1771465afc0703e80ab3`.
Implementation HEAD: `06dfdccc94fc3fc4e20bce2864470f450b44c358`.
Branch: `feat/design-overhaul`. Owner: `xdenepalmer <144656856+xdenepalmer@users.noreply.github.com>`.
This report is a separate documentation-only commit after the implementation HEAD.

## Implementation and interfaces

`src/components/admin/ui.jsx` retains all legacy exports and adds focused modules under `ui/`. Existing primary buttons lose their glow and panels use tinted semantic surfaces/hairlines. ADMIN_PAGE retains existing gutters and establishes the named container. WorkspaceSkeleton's lines/controls now use the shared skeleton. No panel conversion, backend, auth, API, schema or production I/O changes. Native changes are deterministic generated constants only.

```jsx
<AdminDataTable
  label="Members" rows={filteredMembers}
  columns={[
    {key:'name', header:'Member', sortable:true},
    {key:'amount', header:'Amount', sortable:true, sortValue:row => row.amount},
    {key:'actions', header:'Actions', render:row => <AdminButton onClick={() => review(row)}>Review {row.name}</AdminButton>},
  ]}
  getRowKey={row => row.id} getRowLabel={row => row.name}
  selectable selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys}
/>
<AdminFilterBar queryKey="memberQuery" searchLabel="Search members"
  filters={[{key:'memberStatus',label:'Status',options:[{value:'active',label:'Active'}]}]}
  onChange={setFilters} />
<AdminDrawer open={open} onOpenChange={setOpen} title="Member detail"
  description="Review this member" footer={<AdminButton onClick={() => setOpen(false)}>Done</AdminButton>}>
  <AdminFormField label="Note" helper="Staff only" error={error}>
    <textarea ref={noteRef} value={note} onChange={onNoteChange} />
  </AdminFormField>
</AdminDrawer>
```

- Table `rows` means all current filtered results. Stable unique keys are required. Header checkbox selects/deselects all supplied results and retains keys outside them. Inputs and Sets are never mutated. `selectedKeys === undefined` uses local state initialized by `defaultSelectedKeys`; a supplied Set is controlled, including an empty Set. `sort === undefined` uses `defaultSort`; controlled `sort={null}` clears it. Sort toggles ascending, descending, then clear. Sortable columns may provide `sortValue(row)`; nulls remain last and numeric values sort numerically. `render(row)` permits independent actions inside valid cells.
- Table status props: `loading`, `error` (string/Error), `onRetry`, `emptyTitle`, `emptyDescription`, `emptyAction`. Empty/error states expose context and a recovery action. Table hooks: `data-admin-table`, `data-virtualized`, `data-table-scroll`, `data-row-key`; native table/header roles, `aria-sort`, total `aria-rowcount` including header, and absolute `aria-rowindex` starting at 2 for data. Accessible names: `Select all filtered results`, `Select {row label}`, sortable column header, `{label} scroll area`. Selection status includes total and outside-current-results count.
- Above 200 records, actual scroll-container dimensions and measured variable row heights drive the mounted window. Width, inherited text size and density invalidate measurements. A focused key remains mounted even outside the visible range. Explicit `Show all {N} results for keyboard navigation` renders every result and action in document Tab order; `Use virtual scrolling` restores windowing. Small lists do not install measurement/resize observers. Selection does not influence the window. Desktop selection-column width derives from control height plus cell padding; phone cards retain full readable fields.
- FilterBar requires the existing Router. It debounces typed queries (token default 250 ms), uses replace navigation preserving pathname/hash/state, synchronizes history navigation, normalizes declared option values, and resets only owned keys. Unknown/duplicate query parameters and workspace/intent parameters survive. Callers should choose workspace-specific filter keys and keep section/intent parameters outside the owned filter list. Pure `readFilterValues` / `writeFilterValues` are exported for consumers.
- Drawer uses a native modal dialog for inert background, with explicit Tab/ShiftTab wrapping and saved opener restoration. `title` labels it; optional `description` describes it. `Close drawer` occupies a separate reserved top region. Title, description, content and optional footer share the remaining scroll region, keeping long 200% text reachable. Optional `trigger` is composed without replacing its handler.
- FormField requires one child; it preserves refs/events/existing aria-describedby, assigns a real label/id, appends helper/error ids and marks invalid errors. Optional `id`, `helper`, `error`, `required`. Inputs have at least 16 px type and 44 px control targets.
- Segmented: `{label, options:[{value,label,disabled?}], value?,defaultValue?,onValueChange?}`. Radiogroup semantics, one enabled tab stop; arrows/Home/End skip disabled options. Timeline: `{items:[{id,timestamp,title,detail?,metadata?}],label?}` produces an ordered list and readable machine-tagged times.
- StatCard: `{label,value,detail?,status?,children?}`. EmptyState: `{title,description,action?,children?}`. Badge: `{status,children?,className?}`, with exported `ADMIN_STATUS_TONES` and a neutral unknown fallback. Skeleton: `{variant='line',size='long',label='Loading content',decorative=false,className?}`; line/control/field/editor/metric geometry and centralized reduced-motion support.

## Files

- Source: `src/components/admin/ui.jsx`, `ui/{AdminDataTable,AdminFilterBar,AdminDrawer,primitives}.jsx`, `ui/model.mjs`, `ui/kit.css`, `WorkspaceSkeleton.jsx`.
- Shared close/header carry-forward: `src/components/ui/command.jsx`, `src/components/ui/dialog.jsx` (`closeHeader` opt-in retains default consumers).
- Tokens/generator: `design/tokens.json`, `scripts/build-tokens.mjs`; deterministic `src/styles/{tokens,admin-kit-queries}.css`, `ui/kitTokens.mjs`, native `Generated/XertTokens.swift`. CSS container breakpoints and JS window/debounce knobs are generated from the shared source; app components do not import raw token JSON.
- Tests: `test/admin-kit-model.test.js`, `test/admin-kit-render.test.js`, `test/admin-ui-kit.test.js` (expanded extraction scanner, semantic/no-glow assertion; existing minimum input/gutter/centralization checks retained).
- Parent owns all fixture/browser runner/proof documentation changes and they are not in this implementation commit.

## Red / green and verification

- Pure model RED: six failing assertions (`undefined` versus required function) before implementation; GREEN: 6/6 for numeric/stable/immutable sorting, clear toggles, hidden selection preservation, owned URL writes, measured windows/focus pinning and recycling 320 records to the final result.
- Real rendered-component RED: five missing-export failures before implementation; GREEN: 5/5 using Vite SSR loading of actual components, checking label/helper/error association, semantic table/sort/actions, pending/empty/retry, neutral statuses/selected radio, and ordered timestamp/metadata output.
- Parent actual-browser RED: native modal Tab traversal reached BODY; 390/200% header consumed content height. Fixed explicit Tab boundaries and reserved close region with shared content scrolling. Parent reported `kit-fourth` 4/4 and reduced-motion `kit-motion` 2/2 passing; parent inspected 390/200% drawer as readable. Browser tests also passed numeric sorting, all-filtered/outside selection, 320-result full keyboard mode, focus-preserving recycling, field refs/events and aria relationships. Last selection-column improvement follows that proof; parent owns final stable-HEAD rerun and fresh review.
- Final implementation gates: `npm test` **1157/1157**, `npm run lint` **PASS**, `npm run build` **PASS** (includes `tokens:check`; PWA precache verifies 133 JS/CSS assets). Focused kit/token checks **24/24**. `git diff --check` clean apart from informational repository LF/CRLF notices.
- `npm run typecheck` remains **FAIL** for existing A/B branch work, with no C1 diagnostics. These are unresolved branch issues, not an accepted baseline: AdminLayout.jsx:75 NodeList iteration; :165 CSS custom property typing; :268 aria-orientation inference. Public nav SmartLink optional-prop inference propagates at DesktopLinks.jsx:51/52; MenuInformation.jsx:25/30/31/39/40/43; MobileSheet.jsx:94; PublicNav.jsx:57. Parent is routing their correction separately.

## Self-review and remaining proof

Checked immutable state/control contracts, complete filtered selection, no invalid nested action buttons, stable row keys, measured spacers, focus pinning and full-results keyboard reachability, URL ownership/history/state preservation, child ref/event composition, token provenance/parity, narrow-container cards, reduced motion, and scoped staged files. No native controls or workspaces changed. Native visual/VoiceOver proof remains separate and is not a C1 dependency.

Final committed-HEAD browser proof (including selection-column geometry), shell command close/header regression screenshots, and independent review remain parent-owned. Browserslist reports its existing stale-data notice; no dependency updates were made.
