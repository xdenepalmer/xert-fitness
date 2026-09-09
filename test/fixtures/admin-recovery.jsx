// Test entry only. Vite's production entry never imports this fixture.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminWorkspaceBoundary } from '../../src/components/admin/AdminWorkspaceBoundary';
import '../../src/index.css';

let available = false;
function RecoverableRegion() {
  if (!available) throw new Error('Intentional local recovery fixture failure');
  return <section><h2>Recovered local region</h2><p>The surrounding editor stayed mounted.</p></section>;
}
function RecoveryFixture() {
  const [draft, setDraft] = useState('');
  return <main>
    <h1>Surrounding editor</h1>
    <label>Unsaved surrounding draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <button type="button" onClick={() => { available = true; }}>Make test region available</button>
    <AdminWorkspaceBoundary><RecoverableRegion /></AdminWorkspaceBoundary>
  </main>;
}
createRoot(document.getElementById('recovery-fixture')).render(<RecoveryFixture />);
