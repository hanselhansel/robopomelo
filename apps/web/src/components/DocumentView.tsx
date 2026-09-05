import type { ReviewDocument, TraceabilityRow, Deployment, FieldDiff } from '@robopomelo/spec';
import { findRecord } from '../lib/records.js';
import { PagedList } from './ui.js';
const renderRecord = (record: ReviewDocument['sections'][number]['records'][number]) => (
  <div className="document-record" key={record.id}>
    <h4>{record.title}</h4>
    <dl>
      {record.fields.map((field, index) => (
        <div key={`${field.label}-${index}`}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  </div>
);
export function DocumentView({ document }: { document: ReviewDocument }) {
  return (
    <article className="review-document">
      <header>
        <p className="eyebrow">Deployment specification</p>
        <h2 className="document-title">{document.title}</h2>
        <p className="meta">Source revision: {document.sourceRevision}</p>
      </header>
      {document.sections.map((section) => (
        <section key={section.id} id={`document-${section.id}`}>
          <h3>{section.title}</h3>
          {section.records.length > 50 ? (
            <PagedList
              printAll
              items={section.records}
              label={section.title.toLowerCase()}
              searchText={(record) => `${record.title} ${record.id}`}
            >
              {renderRecord}
            </PagedList>
          ) : (
            section.records.map(renderRecord)
          )}
        </section>
      ))}
    </article>
  );
}
export function Traceability({
  rows,
  deployment,
  onView,
}: {
  rows: TraceabilityRow[];
  deployment: Deployment;
  onView: (id: string) => void;
}) {
  return (
    <div className="table-scroll" role="region" aria-label="Traceability table" tabIndex={0}>
      <table>
        <caption>One row per need. Follow a record to inspect its planning context.</caption>
        <thead>
          <tr>
            {['Need', 'Material flows', 'KPIs', 'Requirements', 'Acceptance tests', 'Evidence', 'Gaps'].map(
              (title) => (
                <th key={title} scope="col">
                  {title}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.needId}>
              {[
                [row.needId],
                row.workflowIds,
                row.kpiIds,
                row.requirementIds,
                row.testIds,
                row.evidenceIds,
              ].map((ids, i) => (
                <td key={i}>
                  {ids.length
                    ? ids.map((id) => (
                        <button key={id} className="text-link" onClick={() => onView(id)}>
                          {findRecord(deployment, id)?.record.title ?? id}
                        </button>
                      ))
                    : 'No link'}
                </td>
              ))}
              <td>{row.gapRuleIds.join(', ') || 'No detected gap'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const display = (value: unknown) =>
  value === null ? 'Missing' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
export function DiffView({ diff }: { diff: FieldDiff[] }) {
  return (
    <div className="table-scroll" role="region" aria-label="Changed fields" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Record and field</th>
            <th scope="col">Before</th>
            <th scope="col">Proposed value</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((row, i) => (
            <tr key={i}>
              <th scope="row">
                {row.collection} · {row.id}
                <br />
                {row.field}
              </th>
              <td>
                <pre>{display(row.before)}</pre>
              </td>
              <td>
                <pre>{display(row.after)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {diff.length === 0 && <p>No field changes in this revision.</p>}
    </div>
  );
}
