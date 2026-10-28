import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../src/app/providers/LanguageProvider';
import { AdminModal } from '../../src/components/admin/AdminModal';
import '../../src/styles.css';

function ModalHarness() {
  const [mode, setMode] = useState(null);
  const [locked, setLocked] = useState(false);
  const [value, setValue] = useState('');
  const [closedValue, setClosedValue] = useState('');

  function open(nextMode) {
    setLocked(nextMode === 'empty');
    setMode(nextMode);
  }

  return <main>
    <button id="opener" onClick={() => open('form')}>Open form dialog</button>
    <button onClick={() => open('single')}>Open single control dialog</button>
    <button onClick={() => open('empty')}>Open locked empty dialog</button>
    <output>{closedValue}</output>
    {mode && <AdminModal
      title="Test dialog"
      canClose={!locked}
      onClose={() => { setClosedValue(value); setMode(null); }}
    >
      {mode === 'form' && <>
        <label>Value<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <fieldset disabled><input aria-label="Disabled field" /></fieldset>
        <input hidden aria-label="Hidden field" />
        <button onClick={() => setLocked((current) => !current)}>Toggle dismissal</button>
      </>}
    </AdminModal>}
  </main>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><LanguageProvider><ModalHarness /></LanguageProvider></React.StrictMode>
);
