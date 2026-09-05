import { questions, type StepId } from '@robopomelo/spec';
import { promptApplies } from '@robopomelo/core';
import { editKnowledge } from './knowledge.js';
import { textValue } from './scalar.js';
import { newRecord } from './record-defaults.js';
import { knowledgeDetails, type EditorContext } from './editor-context.js';
import { back, WizardBack, type TerminalAdapter } from './terminal.js';
export async function editQuestions(
  terminal: TerminalAdapter,
  step: StepId,
  context: Omit<EditorContext, 'collection' | 'recordId'>,
): Promise<void> {
  for (;;) {
    const applicable = questions.filter(
      (q) => q.step === step && promptApplies(context.deployment, q.appliesWhen),
    );
    const id = await terminal.choose('Applicable engineering prompts', [
      ...applicable.map((q) => ({ value: q.id, label: q.prompt })),
      back,
    ]);
    if (id === 'back') return;
    const prompt = applicable.find((q) => q.id === id)!;
    const existing = context.deployment.challengeAnswers.filter(
      (a) => a.promptId === id && a.promptVersion === prompt.version,
    );
    let answer = existing[0];
    if (existing.length > 1) {
      const selected = await terminal.choose('Choose the exact existing answer', [
        ...existing.map((a) => ({ value: a.id, label: `${a.title} [${a.id}]` })),
        back,
      ]);
      if (selected === 'back') continue;
      answer = existing.find((a) => a.id === selected);
    }
    const record =
      answer ??
      newRecord('challengeAnswers', context.id(), prompt.prompt, {
        promptId: id,
        promptVersion: prompt.version,
      });
    try {
      record.answer = await editKnowledge(
        terminal,
        record.answer,
        (old) => textValue(terminal, 'Supplied answer', old),
        knowledgeDetails(
          terminal,
          { ...context, collection: 'challengeAnswers', recordId: record.id },
          record.answer,
        ),
      );
      if (!answer) context.deployment.challengeAnswers.push(record);
    } catch (error) {
      if (!(error instanceof WizardBack)) throw error;
    }
  }
}
