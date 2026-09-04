import { fields, workflows, questions } from '@robopomelo/spec/browser';
import type { Collection, Deployment, Json, PatchOperation, StepId } from '@robopomelo/spec';
import { Field } from '../components/Field.js';
import { RecordEditor } from '../components/RecordEditor.js';
import { PagedList } from '../components/ui.js';
import { KnowledgeField } from '../components/KnowledgeField.js';
import { References, referenceOptions } from '../components/References.js';
import { collectionLabels, newRecord, singular } from '../lib/records.js';
const homes: Record<StepId, Collection[]> = {
  frame: ['stakeholders', 'needs', 'problems'],
  flow: ['workflows', 'challenges', 'risks', 'assumptions'],
  success: ['kpis', 'assumptions'],
  requirements: ['requirements', 'decisions', 'challenges', 'risks', 'assumptions'],
  acceptance: ['acceptanceTests', 'evidence'],
};
function applies(condition: string, d: Deployment) {
  return (
    condition === 'always' ||
    (condition === 'has-intended-flow' && d.workflows.some((f) => f.mode === 'intended')) ||
    (condition === 'has-kpi' && d.kpis.length > 0) ||
    (condition === 'has-requirement' && d.requirements.length > 0) ||
    (condition === 'has-acceptance-test' && d.acceptanceTests.length > 0)
  );
}
export function Planning({
  step,
  deployment,
  edit,
  onView,
  revealId,
}: {
  step: StepId;
  deployment: Deployment;
  edit: (op: PatchOperation) => void;
  onView: (id: string) => void;
  revealId: string | null;
}) {
  const workflow = workflows.find((w) => w.id === step)!;
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Planning step {workflows.findIndex((w) => w.id === step) + 1} of 5</p>
        <h1 tabIndex={-1} id="section-heading">
          {workflow.title}
        </h1>
        <p className="lede">{workflow.description}</p>
      </div>
      {step === 'frame' && (
        <section className="project-frame" aria-label="Project framing">
          {fields
            .filter((f) => f.collection === 'project')
            .map((f) => (
              <Field
                key={f.path}
                id="project"
                definition={f}
                value={(deployment.project as unknown as Record<string, unknown>)[f.path]}
                deployment={deployment}
                onChange={(v) => edit({ op: 'project', fields: { [f.path]: v } })}
                onView={onView}
              />
            ))}
        </section>
      )}
      {homes[step].map((collection) => (
        <section key={collection} aria-labelledby={`heading-${collection}`}>
          <div className="section-title">
            <h2 id={`heading-${collection}`}>{collectionLabels[collection]}</h2>
            <button
              id={`add-${collection}`}
              onClick={() =>
                edit({ op: 'add', collection, record: newRecord(collection) as unknown as Json })
              }
            >
              Add {singular[collection]}
            </button>
          </div>
          {deployment[collection].length === 0 ? (
            <p className="empty">
              Add a {singular[collection]} to make its purpose, ownership and connections explicit.
            </p>
          ) : (
            <PagedList
              key={`${collection}-${revealId ?? ''}`}
              items={[...deployment[collection]].sort((a, b) =>
                a.id === revealId
                  ? -1
                  : b.id === revealId
                    ? 1
                    : a.title.toLocaleLowerCase().localeCompare(b.title.toLocaleLowerCase()) ||
                      a.id.localeCompare(b.id),
              )}
              label={collectionLabels[collection].toLowerCase()}
              searchText={(r) => `${r.title} ${r.id}`}
            >
              {(record) => (
                <details className="record" key={record.id} open={record.id === revealId || undefined}>
                  <summary>
                    <span>{record.title}</span>
                    <small>{record.id}</small>
                  </summary>
                  <RecordEditor
                    collection={collection}
                    record={record}
                    deployment={deployment}
                    edit={edit}
                    onView={onView}
                  />
                </details>
              )}
            </PagedList>
          )}
        </section>
      ))}
      <section className="engineering-questions">
        <p className="eyebrow">Think through the deployment</p>
        <h2>Engineering questions</h2>
        <p>Answers are part of this specification. An explicit unknown can carry an owner and next action.</p>
        {questions
          .filter((q) => q.step === step)
          .map((q) => {
            const answer = deployment.challengeAnswers.find((a) => a.promptId === q.id);
            const applicable = applies(q.appliesWhen, deployment);
            const update = (path: string, v: Json) => {
              if (answer)
                edit({ op: 'update', collection: 'challengeAnswers', id: answer.id, fields: { [path]: v } });
              else
                edit({
                  op: 'add',
                  collection: 'challengeAnswers',
                  record: {
                    ...newRecord('challengeAnswers'),
                    title: q.prompt,
                    promptId: q.id,
                    promptVersion: q.version,
                    [path]: v,
                  } as unknown as Json,
                });
            };
            return (
              <details
                key={q.id}
                className="question"
                id={`question-${q.id}`}
                open={answer?.id === revealId || q.id === revealId || undefined}
              >
                <summary>
                  {q.prompt}
                  {!applicable && <small>Not currently applicable. Any prior answer is retained.</small>}
                </summary>
                <p className="help">Applies when: {q.appliesWhen.replaceAll('-', ' ')}.</p>
                <KnowledgeField
                  id={answer?.id ?? q.id}
                  label="Engineering answer"
                  kind="text"
                  value={answer?.answer ?? null}
                  options={referenceOptions(deployment, 'stakeholders')}
                  onChange={(v) => update('answer', v as Json)}
                />
                <References
                  id={`${q.id}-links`}
                  label="Related records"
                  value={answer?.relatedIds ?? []}
                  options={referenceOptions(deployment, [
                    'needs',
                    'problems',
                    'workflows',
                    'requirements',
                    'kpis',
                    'acceptanceTests',
                    'risks',
                    'assumptions',
                    'challenges',
                  ])}
                  onChange={(v) => update('relatedIds', v)}
                  onView={onView}
                />
              </details>
            );
          })}
      </section>
    </>
  );
}
