# Shared design tokens

Edit `tokens.json`, then run `npm run tokens:build`. Commit all three outputs: CSS, Tailwind configuration, and Swift. `npm run tokens:check` and the production prebuild reject drift. Generated files use LF on every platform.

Primitives hold brand values. Semantics express their purpose. Components refer to semantics or component knobs; components must never import the primitive source or name primitive variables. References use `{tier.name}`. Color `mix` uses an sRGB channel interpolation and `alpha` applies opacity, both resolved deterministically to hex for identical web/native colors. Opacity variants retain existing visual treatments under semantic names during migration.

Use `var(--surface-raised)`, `bg-surface-raised`, or `XertTokens.surfaceRaised`. Existing `xert-*` utility names are compatibility aliases backed by semantics. Swift dimensions use points (one web rem is 16 points) and durations use seconds. Semantic color names are identical across CSS and Swift; Swift properties use camel case.

`data-density="comfortable"` (default) and `data-density="compact"` select `--space-row`; Tailwind exposes `p-row`/`gap-row`. Navigation heights, card radius and dock blur are component knobs. Reduced motion sets all motion durations to zero centrally; reduced transparency removes backdrop filtering and makes translucent surfaces opaque. Native callers use `XertTokens.duration(_:reduceMotion:)`, `rowSpacing(compact:)` and `dockBlur(reduceTransparency:)` with SwiftUI environment preferences.

Canvas and QR encoders must call `resolveSemanticColor` from `src/lib/designTokens.js` at render time. It returns a concrete hex value instead of passing an unsupported CSS variable to a canvas API. QR foreground/background and signature ink have dedicated semantics to preserve dark-on-white exported records.

Tailwind's default color palette is disabled. Existing palette utilities were migrated to purpose-based `status-*`, `category-*` and `document-*` semantics, retaining the original shade suffix and exact color for visual compatibility. Use the main `state-*` semantics for new status treatments. Only `black`, `white` and `xert-*` compatibility names remain, explicitly backed by semantics. The scanner rejects default palette utilities even behind responsive, state or arbitrary-selector variants. Canvas overrides support concrete hex and RGB(A) colors, including percentages and alpha; unsupported color syntax fails explicitly instead of using stale channel values.
