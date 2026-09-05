import type { Finding, ValidationReport } from '@robopomelo/spec';
import { PagedList } from './ui.js';
export function Findings({
  report,
  onFinding,
}: {
  report: ValidationReport;
  onFinding: (finding: Finding) => void;
}) {
  return (
    <div className="findings">
      <p className="eyebrow">Document checks</p>
      <h2>Findings</h2>
      <p>
        {report.counts.blockers} blockers · {report.counts.warnings} warnings
      </p>
      <p className="help">
        These checks assess the specification. They do not certify a physical deployment.
      </p>
      <PagedList
        printAll
        items={report.findings}
        label="findings"
        searchText={(f) => `${f.message} ${f.ruleId} ${f.recordIds.join(' ')}`}
      >
        {(f) => (
          <article key={f.fingerprint} className={`finding ${f.severity}`}>
            <div className="meta">
              {f.status === 'waived' ? 'Waived' : f.severity === 'blocker' ? 'Blocker' : 'Warning'} ·{' '}
              {f.ruleId}
              {f.acknowledged ? ' · Acknowledged' : ''}
            </div>
            <button className="text-link" onClick={() => onFinding(f)}>
              {f.message}
            </button>
            <p>{f.nextAction}</p>
          </article>
        )}
      </PagedList>
    </div>
  );
}
