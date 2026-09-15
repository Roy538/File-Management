import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiDownload } from '../lib/api-client';
import { Layout } from '../components/Layout';
import { ErrorState } from '../components/ErrorState';

type ReportKey = 'outstanding' | 'daily-dispatches' | 'daily-returns' | 'missing' | 'by-department' | 'monthly' | 'movement-history';

const today = new Date().toISOString().slice(0, 10);
const nowYear = new Date().getFullYear();
const nowMonth = new Date().getMonth() + 1;

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportKey | null>(null);
  const [date, setDate] = useState(today);
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [movDateFrom, setMovDateFrom] = useState('');
  const [movDateTo, setMovDateTo] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  function buildUrl(key: ReportKey, format?: string): string {
    const p = new URLSearchParams();
    if (format) p.set('format', format);
    if (key === 'daily-dispatches' || key === 'daily-returns') p.set('date', date);
    if (key === 'monthly') { p.set('year', String(year)); p.set('month', String(month)); }
    if (key === 'movement-history') {
      if (movDateFrom) p.set('dateFrom', movDateFrom);
      if (movDateTo) p.set('dateTo', movDateTo);
    }
    return `/api/reports/${key}?${p}`;
  }

  const { data: previewData, isLoading: previewLoading, isError: previewError, refetch: refetchPreview } = useQuery({
    queryKey: ['report-preview', activeReport, date, year, month, movDateFrom, movDateTo],
    queryFn: () => api.get<any>(buildUrl(activeReport!)),
    enabled: !!activeReport,
    staleTime: 30_000,
  });

  async function handleDownload(key: ReportKey, filename: string, format: 'xlsx' | 'pdf') {
    const dlKey = `${key}-${format}`;
    setDownloading(dlKey);
    try {
      const blob = await apiDownload(buildUrl(key, format));
      downloadFile(blob, filename.replace('.xlsx', format === 'pdf' ? '.pdf' : '.xlsx'));
    } finally {
      setDownloading(null);
    }
  }

  const reports: {
    key: ReportKey;
    title: string;
    description: string;
    filename: string;
    hasDateFilter?: boolean;
    hasMonthFilter?: boolean;
    hasMovFilter?: boolean;
  }[] = [
    { key: 'outstanding',       title: 'Outstanding Files',      description: 'All files currently dispatched and not yet returned.',                   filename: 'outstanding-files.xlsx' },
    { key: 'daily-dispatches',  title: 'Daily Dispatches',       description: 'Files dispatched on the selected date.',                                 filename: `dispatches-${date}.xlsx`,    hasDateFilter: true },
    { key: 'daily-returns',     title: 'Daily Returns',          description: 'Files returned on the selected date.',                                   filename: `returns-${date}.xlsx`,       hasDateFilter: true },
    { key: 'missing',           title: 'Missing Files',          description: 'All files currently flagged as missing.',                                filename: 'missing-files.xlsx' },
    { key: 'by-department',     title: 'Files by Department',    description: 'Count of files currently held per department.',                          filename: 'files-by-department.xlsx' },
    { key: 'monthly',           title: 'Monthly Stats',          description: 'Day-by-day dispatch and return counts for the selected month.',          filename: `monthly-${year}-${String(month).padStart(2,'0')}.xlsx`, hasMonthFilter: true },
    { key: 'movement-history',  title: 'File Movement History',  description: 'Audit trail of all file movements. Filter by date range.',               filename: 'movement-history.xlsx',      hasMovFilter: true },
  ];

  function renderPreview(data: any) {
    const arr = Array.isArray(data) ? data : data?.rows ?? [];
    if (!arr.length) return <p className="text-sm text-gray-400 px-1 pt-3">No data for this period.</p>;
    const keys = Object.keys(arr[0]);
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 mt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {keys.map(k => <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{k.replace(/([A-Z])/g, ' $1').trim()}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {arr.slice(0, 15).map((row: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                {keys.map(k => <td key={k} className="px-3 py-2 text-gray-700 whitespace-nowrap">{row[k] === true ? 'Yes' : row[k] === false ? 'No' : row[k] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {arr.length > 15 && <p className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">Showing first 15 of {arr.length} rows.</p>}
      </div>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

        {/* Global date filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date (daily reports)</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Report cards */}
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{r.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <button onClick={() => setActiveReport(activeReport === r.key ? null : r.key)} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    {activeReport === r.key ? 'Hide' : 'Preview'}
                  </button>
                  <button onClick={() => handleDownload(r.key, r.filename, 'xlsx')} disabled={downloading === `${r.key}-xlsx`} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 rounded-lg transition-colors">
                    {downloading === `${r.key}-xlsx` ? '…' : 'Excel ↓'}
                  </button>
                  <button onClick={() => handleDownload(r.key, r.filename.replace('.xlsx', '.pdf'), 'pdf')} disabled={downloading === `${r.key}-pdf`} className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg transition-colors">
                    {downloading === `${r.key}-pdf` ? '…' : 'PDF ↓'}
                  </button>
                </div>
              </div>

              {/* Movement history date range sub-filter */}
              {r.hasMovFilter && activeReport === r.key && (
                <div className="px-5 pb-3 flex gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input type="date" value={movDateFrom} onChange={e => setMovDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input type="date" value={movDateTo} onChange={e => setMovDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}

              {activeReport === r.key && (
                <div className="px-5 pb-5 border-t border-gray-100">
                  {previewLoading ? (
                    <p className="text-sm text-gray-400 pt-4">Loading preview…</p>
                  ) : previewError ? (
                    <ErrorState title="Preview failed" message="Could not load report data." onRetry={refetchPreview} />
                  ) : renderPreview(previewData)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
