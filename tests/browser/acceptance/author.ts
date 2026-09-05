import { expect, type Locator, type Page } from '@playwright/test';

export const operator = 'Fictional operator Ada';
export const field = (record: Locator, path: string) => record.locator(`[data-field="${path}"]`);
export async function navigate(page: Page, name: string) {
  const target = page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('button', { name, exact: true });
  await target.click();
  // The app completes pending durable saves before activating the destination.
  await expect(target).toHaveAttribute('aria-current', 'page');
}
export async function knowledge(record: Locator, path: string, value: string, person = false) {
  const group = field(record, path);
  await group.locator('select').first().selectOption('provided');
  if (person) {
    const option = group.locator('option').filter({ hasText: value });
    await group
      .locator('select')
      .nth(1)
      .selectOption((await option.getAttribute('value')) as string);
  } else await group.locator('textarea').fill(value);
}
export async function person(record: Locator, path: string) {
  await knowledge(record, path, operator, true);
}
export async function reference(record: Locator, path: string, title: string) {
  const group = field(record, path);
  await group.getByRole('button', { name: /^Choose / }).click();
  await group.locator('label.check-row').filter({ hasText: title }).getByRole('checkbox').check();
  await group.getByRole('button', { name: 'Close record choices' }).click();
}
export async function list(record: Locator, path: string, value: string) {
  const group = field(record, path);
  await group.getByRole('button', { name: /^Add / }).click();
  await group.locator('input').last().fill(value);
}
export async function quantity(record: Locator, path: string, value: string) {
  const group = field(record, path);
  await group.locator('select').first().selectOption('provided');
  await group.getByLabel('Value', { exact: true }).fill(value);
  await group.getByLabel('Unit', { exact: true }).fill('count/h');
  await group.getByLabel('Counted or measured subject').fill('pallet');
}
export async function add(page: Page, collection: string, title: string) {
  await page.locator(`#add-${collection}`).click();
  const section = page.locator(`section[aria-labelledby="heading-${collection}"]`);
  await section.locator('details.record > summary').last().click();
  const record = section.locator('.record-editor').last();
  await record.getByLabel('Name', { exact: true }).fill(title);
  return record;
}
const answers: Record<string, string> = {
  'problem-owner': 'Fictional operator Ada experiences transfer delays, benefits and reviews this plan.',
  'uncovered-needs':
    'Ada represents operations, maintenance and shift supervision in this fictional small-cell exercise.',
  constraints: 'One 500 kg pallet, level floor, segregated test cell; no live deployment is authorized.',
  'occupied-destination': 'Hold at receiving; Ada clears staging before releasing the transfer.',
  'pickup-failure': 'Stop and notify Ada, who isolates a damaged pallet and clears the route.',
  handoff: 'Ada confirms pickup and delivery using the observation record.',
  'peak-volume': 'This fictional cell runs a constant ten pallets per hour; peak operation is outside scope.',
  baseline: 'Baseline remains unknown. Ada must measure one manual receiving shift before implementation.',
  'measurement-window': 'One full hour includes charging and interruptions in the segregated test cell.',
  tradeoffs: 'No pallet damage or uncontrolled release is acceptable.',
  'site-inputs': 'Ada must confirm the 500 kg load, level floor and segregated route before engineering.',
  'failure-recovery': 'Stop on communication or handoff failure; Ada authorizes manual recovery.',
  'vendor-neutrality': 'The requirement defines pallet transfer behavior without naming a vendor.',
  'acceptance-conditions': 'Test normal transfer and occupied staging in a segregated fictional cell.',
  'acceptance-evidence': 'Timestamped pickup and delivery observations and exception response notes.',
  'acceptance-authority':
    'Fictional operator Ada assesses future evidence and approves only this fictional specification.',
};
export async function questions(page: Page) {
  for (const item of await page.locator('details.question').all()) {
    const id = (await item.getAttribute('id'))!.replace('question-', '');
    expect(answers[id], `A substantive fixture answer exists for ${id}`).toBeTruthy();
    await item.locator('summary').click();
    await item.getByLabel('Engineering answer state').selectOption('provided');
    await item.getByLabel('Engineering answer value').fill(answers[id]!);
    await item.locator('summary').click();
  }
}

export async function authorFiveSteps(page: Page) {
  const framing = page.getByRole('region', { name: 'Project framing' });
  await knowledge(framing, 'problem', 'Manual receiving-to-staging pallet handoffs are undefined');
  await knowledge(framing, 'outcome', 'Define predictable pallet transfers in a fictional small AMR cell');
  await knowledge(framing, 'scope', 'One 500 kg pallet from receiving to staging; fictional planning only');
  const stakeholder = await add(page, 'stakeholders', operator);
  await knowledge(stakeholder, 'role', 'Fictional warehouse operator and specification approver');
  await list(
    stakeholder,
    'responsibilities',
    'Assess future evidence and review the fictional specification',
  );
  await person(framing, 'approverId');
  const need = await add(page, 'needs', 'Predictable pallet movement');
  await knowledge(need, 'outcome', 'Ten predictable pallet transfers per hour');
  await reference(need, 'beneficiaryIds', operator);
  await questions(page);
  await navigate(page, 'Material flow');
  const flow = await add(page, 'workflows', 'Receiving to staging');
  await person(flow, 'ownerId');
  await knowledge(flow, 'loadSubject', 'pallet');
  await knowledge(flow, 'origin', 'Receiving');
  await knowledge(flow, 'destination', 'Staging');
  await quantity(flow, 'volume', '10');
  await reference(flow, 'needIds', 'Predictable pallet movement');
  await flow.getByRole('button', { name: 'Add flow step', exact: true }).click();
  await flow.getByLabel('Step name').fill('Ada confirms delivery at staging');
  await flow.getByLabel('Location state', { exact: true }).selectOption('provided');
  await flow.getByLabel('Location value', { exact: true }).fill('Staging');
  await flow.getByLabel('Handoff to state').selectOption('provided');
  await flow
    .getByLabel('Handoff to value')
    .selectOption({
      label: (await flow
        .getByLabel('Handoff to value')
        .locator('option')
        .filter({ hasText: operator })
        .textContent()) as string,
    });
  await questions(page);
  await navigate(page, 'Frame');
  await page.locator('section[aria-labelledby="heading-needs"] summary').click();
  await reference(
    page.locator('section[aria-labelledby="heading-needs"] .record-editor'),
    'workflowIds',
    'Receiving to staging',
  );
  await navigate(page, 'Success');
  const kpi = await add(page, 'kpis', 'Transfer rate');
  await person(kpi, 'ownerId');
  await knowledge(kpi, 'definition', 'Completed pallet transfers per hour');
  const baseline = field(kpi, 'baseline');
  await baseline.getByRole('combobox').selectOption('unknown');
  await baseline
    .getByLabel('What is unknown?')
    .fill('Manual baseline has not been measured in this fictional example');
  await baseline
    .getByLabel('Follow-up owner')
    .selectOption({
      label: (await baseline
        .getByLabel('Follow-up owner')
        .locator('option')
        .filter({ hasText: operator })
        .textContent()) as string,
    });
  await baseline
    .getByLabel('Next action', { exact: true })
    .fill('Ada will count manual transfers for one shift before implementation');
  await quantity(kpi, 'target', '10');
  await knowledge(kpi, 'measurementMethod', 'Count completed transfers from timestamped observations');
  await knowledge(kpi, 'measurementWindow', 'One hour including charging and interruptions');
  await reference(kpi, 'needIds', 'Predictable pallet movement');
  await reference(kpi, 'workflowIds', 'Receiving to staging');
  await questions(page);
  await navigate(page, 'Requirements');
  const requirement = await add(page, 'requirements', 'Transfer capability');
  await knowledge(
    requirement,
    'capability',
    'Transfer one pallet between receiving and staging, holding when staging is occupied',
  );
  await knowledge(requirement, 'rationale', 'Meet the predictable pallet movement need');
  await reference(requirement, 'needIds', 'Predictable pallet movement');
  await reference(requirement, 'workflowIds', 'Receiving to staging');
  await reference(requirement, 'kpiIds', 'Transfer rate');
  await knowledge(
    requirement,
    'verificationDisposition',
    'Assess through the planned procedure; no execution is claimed',
  );
  await questions(page);
  await navigate(page, 'Acceptance');
  const future = await add(page, 'evidence', 'Future observation record');
  await future
    .getByLabel('Future evidence description')
    .fill('Future timestamped acceptance observation notes');
  const acceptance = await add(page, 'acceptanceTests', 'Transfer acceptance');
  await reference(acceptance, 'subjectIds', 'Transfer capability');
  await list(acceptance, 'preconditions', 'Segregated fictional cell, inspected pallet and Ada present');
  await list(
    acceptance,
    'procedure',
    'Observe normal transfer, then occupied staging; record whether an uncontrolled release occurs',
  );
  await knowledge(acceptance, 'measurementMethod', 'Inspect the timestamped observation record');
  await field(acceptance, 'criterion').getByLabel('Pass criterion state').selectOption('provided');
  await acceptance.getByLabel('Criterion type').selectOption('boolean');
  await acceptance.getByLabel('Expected result').selectOption('false');
  await reference(acceptance, 'evidenceRequirementIds', 'Future observation record');
  await person(acceptance, 'assessorId');
  await person(acceptance, 'approverId');
  await questions(page);
  await navigate(page, 'Review & export');
}
