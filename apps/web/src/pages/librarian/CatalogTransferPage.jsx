import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { downloadCatalogFile, runCatalogImport } from '../../features/admin/admin-api';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/admin-operations.css';

const FORMATS = [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['json', 'JSON']];
const FIELDS = ['type', 'title', 'authors', 'researchers', 'supervisors', 'isbn', 'publisher', 'edition',
  'publication_year', 'language', 'call_number', 'dewey_code', 'category', 'subjects', 'abstract',
  'academic_year', 'extent', 'dimensions'];
const PAGE = 100;
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
const formatOf = (name) => (/\.(xlsx|csv|json)$/i.exec(name)?.[1] || '').toLowerCase();
const STATUS_TONE = { ready: 'success', duplicate: 'warning', invalid: 'danger' };

function useDownload(token) {
  const [state, setState] = useState({ busy: '', error: null });
  async function run(kind, params) {
    setState({ busy: kind, error: null });
    try { await downloadCatalogFile(token, kind, params); setState({ busy: '', error: null }); }
    catch (error) { setState({ busy: '', error }); }
  }
  return [state, run];
}

function TypeSelect({ value, onChange, allowAll, label }) {
  const { t } = useLanguage();
  return <label><span>{label || t('admin.transfer.type')}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {allowAll && <option value="">{t('admin.transfer.allTypes')}</option>}
      <option value="BOOK">{t('itemTypes.BOOK')}</option>
      <option value="ACADEMIC_WORK">{t('catalogRefinement.academicWork')}</option>
    </select></label>;
}

function FormatSelect({ value, onChange }) {
  const { t } = useLanguage();
  return <label><span>{t('admin.transfer.format')}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>;
}

export function CatalogTransferPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [download, runDownload] = useDownload(auth.token);
  const [exportForm, setExportForm] = useState({ type: '', format: 'xlsx', search: '', includeInactive: false });
  const [templateForm, setTemplateForm] = useState({ type: 'BOOK', format: 'xlsx' });

  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [defaultType, setDefaultType] = useState('BOOK');
  const [mapping, setMapping] = useState(null);
  const [preview, setPreview] = useState(null);
  const [policy, setPolicy] = useState('skip');
  const [rowFilter, setRowFilter] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [phase, setPhase] = useState('idle'); // idle | previewing | confirm | importing | done
  const [importError, setImportError] = useState(null);
  const [result, setResult] = useState(null);

  const fieldLabel = (key) => t(`admin.transfer.fields.${key}`);
  const issueText = (issue) => fill(t(`admin.transfer.codes.${issue.code}`), { field: issue.field ? fieldLabel(issue.field) : '' });
  const params = () => ({ format: formatOf(file?.name), type: defaultType, mapping: mapping || undefined });

  async function runPreview(nextMapping = mapping) {
    if (!file) return;
    setPhase('previewing'); setImportError(null); setResult(null);
    try {
      const { data } = await runCatalogImport(auth.token, 'preview', file,
        { format: formatOf(file.name), type: defaultType, mapping: nextMapping || undefined });
      setPreview(data); setMapping(data.mapping); setShown(PAGE); setPhase('idle');
    } catch (error) { setImportError(error); setPreview(null); setPhase('idle'); }
  }

  async function runImport() {
    setPhase('importing'); setImportError(null);
    try {
      const { data } = await runCatalogImport(auth.token, 'commit', file, { ...params(), duplicatePolicy: policy });
      setResult(data); setPhase('done');
    } catch (error) { setImportError(error); setPhase('idle'); }
  }

  function reset() {
    setFile(null); setPreview(null); setMapping(null); setResult(null); setImportError(null); setPhase('idle');
    if (fileInput.current) fileInput.current.value = '';
  }

  const toImport = preview ? preview.summary.ready + (policy === 'create' ? (preview.summary.creatableDuplicates ?? preview.summary.duplicates) : 0) : 0;
  const visibleRows = useMemo(() => (preview?.rows || []).filter((row) => !rowFilter || row.status === rowFilter), [preview, rowFilter]);

  function downloadErrors() {
    const failed = new Map(result.report.failed.map((item) => [item.rowNumber, item.code]));
    const lines = [[t('admin.transfer.row'), t('admin.transfer.titleCol'), t('admin.transfer.issues')]];
    for (const row of result.rows) lines.push([row.rowNumber, row.record?.title ?? '', row.errors.map(issueText).join(' | ')]);
    for (const [rowNumber, code] of failed) lines.push([rowNumber, '', t(`admin.transfer.codes.${code}`)]);
    const csv = lines.map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'sams-import-errors.csv' });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="admin-page admin-operations catalog-transfer">
      <header className="admin-page__header">
        <span>{t('admin.transfer.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('admin.transfer.title')}</h1>
        <p>{t('admin.transfer.subtitle')}</p>
        <Link className="admin-secondary-button catalog-transfer__back" to="/librarian/catalog">{t('admin.transfer.back')}</Link>
      </header>

      {download.error && <InlineAlert title={t('admin.workflows.readFailed')} message={download.error.message} requestId={download.error.requestId} />}

      <div className="catalog-transfer__grid">
        <section className="admin-card catalog-transfer__card">
          <h2>{t('admin.transfer.exportTitle')}</h2>
          <p>{t('admin.transfer.exportBody')}</p>
          <div className="admin-form-grid">
            <TypeSelect allowAll value={exportForm.type} onChange={(type) => setExportForm((v) => ({ ...v, type }))} />
            <FormatSelect value={exportForm.format} onChange={(format) => setExportForm((v) => ({ ...v, format }))} />
            <label className="admin-form-grid__wide"><span>{t('admin.transfer.search')}</span>
              <input maxLength={300} value={exportForm.search} onChange={(event) => setExportForm((v) => ({ ...v, search: event.target.value }))} /></label>
            <label className="admin-check admin-form-grid__wide"><input type="checkbox" checked={exportForm.includeInactive}
              onChange={(event) => setExportForm((v) => ({ ...v, includeInactive: event.target.checked }))} />
              <span>{t('admin.transfer.includeInactive')}</span></label>
          </div>
          <button type="button" className="admin-primary-button" disabled={Boolean(download.busy)}
            onClick={() => runDownload('export', { ...exportForm, search: exportForm.search.trim() })}>
            {download.busy === 'export' ? t('admin.transfer.downloading') : t('admin.transfer.download')}
          </button>
        </section>

        <section className="admin-card catalog-transfer__card">
          <h2>{t('admin.transfer.templateTitle')}</h2>
          <p>{t('admin.transfer.templateBody')}</p>
          <div className="admin-form-grid">
            <TypeSelect value={templateForm.type} onChange={(type) => setTemplateForm((v) => ({ ...v, type }))} />
            <FormatSelect value={templateForm.format} onChange={(format) => setTemplateForm((v) => ({ ...v, format }))} />
          </div>
          <button type="button" className="admin-secondary-button" disabled={Boolean(download.busy)}
            onClick={() => runDownload('template', templateForm)}>
            {download.busy === 'template' ? t('admin.transfer.downloading') : t('admin.transfer.downloadTemplate')}
          </button>
        </section>
      </div>

      <section className="admin-card catalog-transfer__card">
        <h2>{t('admin.transfer.importTitle')}</h2>
        <p>{t('admin.transfer.importBody')}</p>

        {phase === 'done' && result ? (
          <div className="catalog-transfer__report" aria-live="polite">
            <h3>{t('admin.transfer.reportTitle')}</h3>
            <dl className="catalog-transfer__stats">
              <div><dt>{t('admin.transfer.created')}</dt><dd>{result.report.created}</dd></div>
              <div><dt>{t('admin.transfer.skipped')}</dt><dd>{result.report.skippedDuplicates}</dd></div>
              <div><dt>{t('admin.transfer.invalid')}</dt><dd>{result.report.invalid}</dd></div>
              <div><dt>{t('admin.transfer.failed')}</dt><dd>{result.report.failed.length}</dd></div>
            </dl>
            <div className="admin-row-actions">
              {(result.rows.length > 0 || result.report.failed.length > 0) &&
                <button type="button" className="admin-secondary-button" onClick={downloadErrors}>{t('admin.transfer.downloadErrors')}</button>}
              <button type="button" className="admin-secondary-button" onClick={reset}>{t('admin.transfer.again')}</button>
              <Link className="admin-primary-button" to="/librarian/catalog">{t('admin.transfer.viewCatalog')}</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="admin-form-grid">
              <TypeSelect label={t('admin.transfer.defaultType')} value={defaultType} onChange={(type) => { setDefaultType(type); setPreview(null); }} />
              <label><span>{t('admin.transfer.file')}</span>
                <input ref={fileInput} type="file" accept=".xlsx,.csv,.json"
                  onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setMapping(null); setImportError(null); }} />
                <small>{t('admin.transfer.fileHint')}</small></label>
            </div>
            <button type="button" className="admin-primary-button" disabled={!file || !formatOf(file.name) || phase === 'previewing'}
              onClick={() => runPreview(null)}>
              {phase === 'previewing' ? t('admin.transfer.previewing') : t('admin.transfer.preview')}
            </button>
          </>
        )}

        {importError && <InlineAlert title={t('admin.workflows.readFailed')} message={importError.message} requestId={importError.requestId} />}

        {preview && phase !== 'done' && <>
          <details className="catalog-transfer__mapping" open={preview.missingRequired.length > 0}>
            <summary>{t('admin.transfer.mappingTitle')}</summary>
            <p>{t('admin.transfer.mappingBody')}</p>
            <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>{t('admin.transfer.fileColumn')}</th><th>{t('admin.transfer.field')}</th></tr></thead>
              <tbody>{preview.headers.map((header) => <tr key={header}>
                <td dir="auto">{header}</td>
                <td><select aria-label={header} value={mapping?.[header] ?? ''}
                  onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}>
                  <option value="">{t('admin.transfer.ignore')}</option>
                  {FIELDS.map((key) => <option key={key} value={key}>{fieldLabel(key)}</option>)}
                </select></td></tr>)}</tbody>
            </table></div>
            <button type="button" className="admin-secondary-button" disabled={phase === 'previewing'} onClick={() => runPreview(mapping)}>
              {t('admin.transfer.refresh')}</button>
          </details>

          {preview.missingRequired.length > 0 && <p className="catalog-transfer__warning" role="alert">{t('admin.transfer.missingTitle')}</p>}

          <h3>{t('admin.transfer.summaryTitle')}</h3>
          <div className="catalog-transfer__filters" role="group" aria-label={t('admin.transfer.status')}>
            {[['', 'total'], ['ready', 'ready'], ['duplicate', 'duplicates'], ['invalid', 'invalid']].map(([status, key]) =>
              <button type="button" key={key} aria-pressed={rowFilter === status} onClick={() => { setRowFilter(status); setShown(PAGE); }}>
                {t(`admin.transfer.${key}`)} <strong>{status ? preview.rows.filter((row) => row.status === status).length : preview.summary.total}</strong>
              </button>)}
          </div>

          <div className="admin-table-wrap"><table className="admin-table catalog-transfer__rows">
            <thead><tr><th>{t('admin.transfer.row')}</th><th>{t('admin.transfer.status')}</th><th>{t('admin.transfer.titleCol')}</th>
              <th>{t('admin.transfer.type')}</th><th>{t('admin.transfer.yearCol')}</th><th>{t('admin.transfer.issues')}</th></tr></thead>
            <tbody>{visibleRows.slice(0, shown).map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              <td><AdminStatusBadge tone={STATUS_TONE[row.status]}>{t(`admin.transfer.status${row.status[0].toUpperCase()}${row.status.slice(1)}`)}</AdminStatusBadge></td>
              <td dir="auto">{row.record?.title || '—'}</td>
              <td>{row.record?.type === 'BOOK' ? t('itemTypes.BOOK') : row.record?.type ? t('catalogRefinement.academicWork') : '—'}</td>
              <td>{row.record?.publication_year || '—'}</td>
              <td><ul className="catalog-transfer__issues">
                {row.duplicate && <li>{fill(t(`admin.transfer.dup${row.duplicate.reason}`), { title: row.duplicate.title, row: row.duplicate.rowNumber })}</li>}
                {[...row.errors, ...row.warnings].map((issue, index) => <li key={index} className={row.errors.includes(issue) ? 'is-error' : ''}>{issueText(issue)}</li>)}
              </ul></td>
            </tr>)}</tbody>
          </table></div>
          {visibleRows.length > shown && <button type="button" className="admin-secondary-button" onClick={() => setShown((n) => n + PAGE)}>{t('admin.transfer.showMore')}</button>}

          {preview.summary.duplicates > 0 && <fieldset className="catalog-transfer__policy">
            <legend>{t('admin.transfer.policyTitle')}</legend>
            {['skip', 'create'].map((value) => <label key={value} className="admin-check">
              <input type="radio" name="duplicate-policy" value={value} checked={policy === value} onChange={() => setPolicy(value)} />
              <span>{t(value === 'skip' ? 'admin.transfer.policySkip' : 'admin.transfer.policyCreate')}</span></label>)}
          </fieldset>}

          {toImport === 0 ? <p>{t('admin.transfer.nothing')}</p> : phase === 'confirm' ? (
            <div className="catalog-transfer__confirm" role="alertdialog" aria-label={t('admin.transfer.confirm')}>
              <p>{fill(t('admin.transfer.confirm'), { count: toImport })}</p>
              <div className="admin-row-actions">
                <button type="button" className="admin-primary-button" onClick={runImport}>{t('admin.transfer.confirmYes')}</button>
                <button type="button" className="admin-secondary-button" onClick={() => setPhase('idle')}>{t('admin.transfer.cancel')}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="admin-primary-button" disabled={phase !== 'idle' || preview.missingRequired.length > 0}
              onClick={() => setPhase('confirm')}>
              {phase === 'importing' ? t('admin.transfer.importing') : fill(t('admin.transfer.import'), { count: toImport })}
            </button>
          )}
        </>}
      </section>
    </section>
  );
}
