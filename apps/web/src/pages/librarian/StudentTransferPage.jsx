import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { downloadStudentFile, runStudentImport } from '../../features/admin/admin-api';
import { ACADEMIC_STATUSES } from '../../features/admin/admin-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/admin-operations.css';

const FORMATS = [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['json', 'JSON']];
const FIELDS = ['student_id', 'name', 'email', 'faculty', 'department', 'academic_status', 'active'];
const PAGE = 100;
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
const formatOf = (name) => (/\.(xlsx|csv|json)$/i.exec(name)?.[1] || '').toLowerCase();
const STATUS_TONE = { new: 'success', existing: 'warning', invalid: 'danger' };
const STATUS_LABEL = { new: 'statusNew', existing: 'statusExisting', invalid: 'statusInvalid' };

function FormatSelect({ value, onChange }) {
  const { t } = useLanguage();
  return <label><span>{t('admin.transfer.format')}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>;
}

export function StudentTransferPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const tr = (key) => t(`studentTransfer.${key}`);
  const [download, setDownload] = useState({ busy: '', error: null });
  const [exportForm, setExportForm] = useState({ format: 'xlsx', academicStatus: '', includeInactive: true });
  const [templateFormat, setTemplateFormat] = useState('xlsx');

  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [preview, setPreview] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [rowFilter, setRowFilter] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [phase, setPhase] = useState('idle'); // idle | previewing | confirm | importing | done
  const [importError, setImportError] = useState(null);
  const [result, setResult] = useState(null);

  const fieldLabel = (key) => t(`studentTransfer.fields.${key}`);
  const issueText = (issue) => fill(t(`studentTransfer.codes.${issue.code}`), { field: fieldLabel(issue.field), row: issue.rowNumber, from: issue.from });

  async function runDownload(kind, params) {
    setDownload({ busy: kind, error: null });
    try { await downloadStudentFile(auth.token, kind, params); setDownload({ busy: '', error: null }); }
    catch (error) { setDownload({ busy: '', error }); }
  }

  async function runPreview(nextMapping = mapping) {
    if (!file) return;
    setPhase('previewing'); setImportError(null); setResult(null);
    try {
      const { data } = await runStudentImport(auth.token, 'preview', file, { format: formatOf(file.name), mapping: nextMapping || undefined });
      setPreview(data); setMapping(data.mapping); setShown(PAGE); setPhase('idle');
    } catch (error) { setImportError(error); setPreview(null); setPhase('idle'); }
  }

  async function runImport() {
    setPhase('importing'); setImportError(null);
    try {
      const { data } = await runStudentImport(auth.token, 'commit', file,
        { format: formatOf(file.name), mapping: mapping || undefined, updateExisting });
      setResult(data); setPhase('done');
    } catch (error) { setImportError(error); setPhase('idle'); }
  }

  function reset() {
    setFile(null); setPreview(null); setMapping(null); setResult(null); setImportError(null); setPhase('idle');
    if (fileInput.current) fileInput.current.value = '';
  }

  const toImport = preview ? preview.summary.new + (updateExisting ? preview.summary.existing : 0) : 0;
  const visibleRows = useMemo(() => (preview?.rows || []).filter((row) => !rowFilter || row.status === rowFilter), [preview, rowFilter]);

  function downloadErrors() {
    const lines = [[tr('row'), fieldLabel('student_id'), tr('issues')]];
    for (const row of result.rows) lines.push([row.rowNumber, row.record?.studentId ?? '', row.errors.map(issueText).join(' | ')]);
    for (const item of result.report.failed) lines.push([item.rowNumber, '', t(`studentTransfer.codes.${item.code}`) || item.code]);
    const csv = lines.map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'sams-student-import-errors.csv' });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="admin-page admin-operations catalog-transfer">
      <header className="admin-page__header">
        <span>{t('studentDirectory.eyebrow')}</span>
        <h1 tabIndex={-1}>{tr('title')}</h1>
        <p>{tr('subtitle')}</p>
        <Link className="admin-secondary-button catalog-transfer__back" to="/librarian/students">{tr('back')}</Link>
      </header>

      {download.error && <InlineAlert title={t(download.error.code === 'PERMISSION_DENIED' ? 'admin.transfer.deniedTitle' : 'admin.workflows.readFailed')} message={download.error.message} requestId={download.error.requestId} />}

      <div className="catalog-transfer__grid">
        <section className="admin-card catalog-transfer__card">
          <h2>{tr('exportTitle')}</h2>
          <p>{tr('exportBody')}</p>
          <div className="admin-form-grid">
            <FormatSelect value={exportForm.format} onChange={(format) => setExportForm((v) => ({ ...v, format }))} />
            <label><span>{t('studentDirectory.academicStatus')}</span>
              <select value={exportForm.academicStatus} onChange={(event) => setExportForm((v) => ({ ...v, academicStatus: event.target.value }))}>
                <option value="">{t('admin.common.allStatuses')}</option>
                {ACADEMIC_STATUSES.map((value) => <option key={value} value={value}>{t(`profile.academicStatus.${value}`)}</option>)}
              </select></label>
            <label className="admin-check admin-form-grid__wide"><input type="checkbox" checked={exportForm.includeInactive}
              onChange={(event) => setExportForm((v) => ({ ...v, includeInactive: event.target.checked }))} />
              <span>{t('studentDirectory.includeInactive')}</span></label>
          </div>
          <button type="button" className="admin-primary-button" disabled={Boolean(download.busy)} onClick={() => runDownload('export', exportForm)}>
            {download.busy === 'export' ? t('admin.transfer.downloading') : t('admin.transfer.download')}
          </button>
        </section>

        <section className="admin-card catalog-transfer__card">
          <h2>{t('admin.transfer.templateTitle')}</h2>
          <p>{tr('templateBody')}</p>
          <div className="admin-form-grid"><FormatSelect value={templateFormat} onChange={setTemplateFormat} /></div>
          <button type="button" className="admin-secondary-button" disabled={Boolean(download.busy)} onClick={() => runDownload('template', { format: templateFormat })}>
            {download.busy === 'template' ? t('admin.transfer.downloading') : t('admin.transfer.downloadTemplate')}
          </button>
        </section>
      </div>

      <section className="admin-card catalog-transfer__card">
        <h2>{tr('importTitle')}</h2>
        <p>{t('admin.transfer.importBody')}</p>

        {phase === 'done' && result ? (
          <div className="catalog-transfer__report" aria-live="polite">
            <h3>{t('admin.transfer.reportTitle')}</h3>
            <dl className="catalog-transfer__stats">
              <div><dt>{tr('created')}</dt><dd>{result.report.created}</dd></div>
              <div><dt>{tr('updated')}</dt><dd>{result.report.updated}</dd></div>
              <div><dt>{tr('skipped')}</dt><dd>{result.report.skippedExisting}</dd></div>
              <div><dt>{tr('invalid')}</dt><dd>{result.report.invalid}</dd></div>
              <div><dt>{t('admin.transfer.failed')}</dt><dd>{result.report.failed.length}</dd></div>
            </dl>
            <div className="admin-row-actions">
              {(result.rows.length > 0 || result.report.failed.length > 0) &&
                <button type="button" className="admin-secondary-button" onClick={downloadErrors}>{t('admin.transfer.downloadErrors')}</button>}
              <button type="button" className="admin-secondary-button" onClick={reset}>{t('admin.transfer.again')}</button>
              <Link className="admin-primary-button" to="/librarian/students">{tr('viewStudents')}</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="admin-form-grid">
              <label className="admin-form-grid__wide"><span>{t('admin.transfer.file')}</span>
                <input ref={fileInput} type="file" accept=".xlsx,.csv,.json"
                  onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setMapping(null); setImportError(null); }} />
                <small>{tr('fileHint')}</small></label>
            </div>
            <button type="button" className="admin-primary-button" disabled={!file || !formatOf(file.name) || phase === 'previewing'} onClick={() => runPreview(null)}>
              {phase === 'previewing' ? t('admin.transfer.previewing') : t('admin.transfer.preview')}
            </button>
          </>
        )}

        {importError && <InlineAlert title={t(importError.code === 'PERMISSION_DENIED' ? 'admin.transfer.deniedTitle' : 'admin.workflows.readFailed')} message={importError.message} requestId={importError.requestId} />}

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

          {preview.missingRequired.length > 0 && <p className="catalog-transfer__warning" role="alert">
            {fill(tr('missing'), { fields: preview.missingRequired.map(fieldLabel).join('، ') })}</p>}

          <h3>{t('admin.transfer.summaryTitle')}</h3>
          <div className="catalog-transfer__filters" role="group" aria-label={tr('status')}>
            {[['', 'total', preview.summary.total], ['new', 'new', preview.summary.new], ['existing', 'existing', preview.summary.existing],
              ['invalid', 'invalid', preview.summary.invalid]].map(([status, key, count]) =>
              <button type="button" key={key} aria-pressed={rowFilter === status} onClick={() => { setRowFilter(status); setShown(PAGE); }}>
                {tr(key)} <strong>{count}</strong>
              </button>)}
          </div>

          <div className="admin-table-wrap"><table className="admin-table catalog-transfer__rows">
            <thead><tr><th>{tr('row')}</th><th>{tr('status')}</th><th>{fieldLabel('student_id')}</th><th>{fieldLabel('name')}</th>
              <th>{fieldLabel('email')}</th><th>{tr('issues')}</th></tr></thead>
            <tbody>{visibleRows.slice(0, shown).map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              <td><AdminStatusBadge tone={STATUS_TONE[row.status]}>{tr(STATUS_LABEL[row.status])}</AdminStatusBadge></td>
              <td><bdi>{row.record?.studentId || '—'}</bdi></td>
              <td dir="auto">{row.record?.displayName || '—'}</td>
              <td><bdi>{row.record?.universityEmail || '—'}</bdi></td>
              <td><ul className="catalog-transfer__issues">
                {row.existing && <li>{fill(tr('existingNote'), { name: row.existing.name })}</li>}
                {(row.warnings || []).map((issue, index) => <li key={`w${index}`}>{issueText(issue)}</li>)}
                {row.errors.map((issue, index) => <li key={index} className="is-error">{issueText(issue)}</li>)}
              </ul></td>
            </tr>)}</tbody>
          </table></div>
          {visibleRows.length > shown && <button type="button" className="admin-secondary-button" onClick={() => setShown((n) => n + PAGE)}>{t('admin.transfer.showMore')}</button>}

          {preview.summary.existing > 0 && <fieldset className="catalog-transfer__policy">
            <legend>{tr('existingTitle')}</legend>
            {[[false, 'skipExisting'], [true, 'updateExisting']].map(([value, key]) => <label key={key} className="admin-check">
              <input type="radio" name="existing-policy" checked={updateExisting === value} onChange={() => setUpdateExisting(value)} />
              <span>{tr(key)}</span></label>)}
            {updateExisting && preview.summary.emailChanges > 0 &&
              <p className="catalog-transfer__warning" role="alert">{fill(tr('emailChangeWarning'), { count: preview.summary.emailChanges })}</p>}
          </fieldset>}

          {toImport === 0 ? <p>{tr('nothing')}</p> : phase === 'confirm' ? (
            <div className="catalog-transfer__confirm" role="alertdialog" aria-label={tr('confirm')}>
              <p>{fill(tr('confirm'), { created: preview.summary.new, updated: updateExisting ? preview.summary.existing : 0 })}</p>
              <div className="admin-row-actions">
                <button type="button" className="admin-primary-button" onClick={runImport}>{t('admin.transfer.confirmYes')}</button>
                <button type="button" className="admin-secondary-button" onClick={() => setPhase('idle')}>{t('admin.transfer.cancel')}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="admin-primary-button" disabled={phase !== 'idle' || preview.missingRequired.length > 0} onClick={() => setPhase('confirm')}>
              {phase === 'importing' ? t('admin.transfer.importing') : fill(tr('import'), { count: toImport })}
            </button>
          )}
        </>}
      </section>
    </section>
  );
}
