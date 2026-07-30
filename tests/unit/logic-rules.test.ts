import { describe, it, expect } from 'vitest';

/**
 * Conditional logic rules for form flow
 *
 * LogicRule: { questionId, condition (JSON), action: 'Jump' | 'End' }
 *
 * These tests define how the evaluator resolves jumps during submission.
 * They do not test persistence — only the pure evaluation logic.
 */

import { evaluateNextQuestion } from '../../src/domain/logic-rules';

// ---------- types ----------

interface Question {
  id: string;
  type: string;
  order: number;
}

interface LogicRule {
  id: string;
  questionId: string;
  condition: { operator: string; value: string | number };
  action: { type: 'Jump'; targetQuestionId: string } | { type: 'End' };
}

// -----------------------------------------------------------------

describe('Logic rules — Jump forward', () => {
  const questions: Question[] = [
    { id: 'q1', type: 'Select', order: 1 },
    { id: 'q2', type: 'Text', order: 2 },
    { id: 'q3', type: 'Text', order: 3 },
    { id: 'q4', type: 'Rating', order: 4 },
  ];

  const rules: LogicRule[] = [
    {
      id: 'r1',
      questionId: 'q1',
      condition: { operator: 'equals', value: 'satisfied' },
      action: { type: 'Jump', targetQuestionId: 'q4' },
    },
  ];

  it('jumps forward when the condition matches', () => {
    const next = evaluateNextQuestion('q1', 'satisfied', rules, questions);
    expect(next).toBe('q4');
  });

  it('falls through to the next sequential question when condition does not match', () => {
    const next = evaluateNextQuestion('q1', 'unsatisfied', rules, questions);
    expect(next).toBe('q2');
  });
});

describe('Logic rules — End of form', () => {
  const questions: Question[] = [
    { id: 'q1', type: 'Select', order: 1 },
    { id: 'q2', type: 'Text', order: 2 },
  ];

  const rules: LogicRule[] = [
    {
      id: 'r1',
      questionId: 'q1',
      condition: { operator: 'equals', value: 'skip' },
      action: { type: 'End' },
    },
  ];

  it('returns null to signal form end when End rule matches', () => {
    const next = evaluateNextQuestion('q1', 'skip', rules, questions);
    expect(next).toBeNull();
  });

  it('does not end the form when condition does not match', () => {
    const next = evaluateNextQuestion('q1', 'continue', rules, questions);
    expect(next).toBe('q2');
  });
});

describe('Logic rules — Loop prevention', () => {
  const questions: Question[] = [
    { id: 'q1', type: 'Select', order: 1 },
    { id: 'q2', type: 'Select', order: 2 },
    { id: 'q3', type: 'Text', order: 3 },
  ];

  const rules: LogicRule[] = [
    {
      id: 'r1',
      questionId: 'q1',
      condition: { operator: 'equals', value: 'back' },
      action: { type: 'Jump', targetQuestionId: 'q1' }, // self-loop
    },
    {
      id: 'r2',
      questionId: 'q2',
      condition: { operator: 'equals', value: 'back' },
      action: { type: 'Jump', targetQuestionId: 'q1' }, // backward jump
    },
  ];

  it('prevents a self-loop by falling through to the next sequential question', () => {
    const next = evaluateNextQuestion('q1', 'back', rules, questions);
    // The evaluator must detect the loop and return the sequential next question.
    expect(next).toBe('q2');
  });

  it('prevents a backward jump that would cause an infinite loop', () => {
    // User already answered q1, now at q2. Jumping back to q1 would loop.
    const next = evaluateNextQuestion('q2', 'back', rules, questions);
    // The evaluator must either ignore the backward jump or fall through.
    expect(next).not.toBe('q1');
  });
});

describe('Logic rules — Deleted question reference', () => {
  const questions: Question[] = [
    { id: 'q1', type: 'Select', order: 1 },
    { id: 'q3', type: 'Text', order: 2 },
    // q2 has been deleted
  ];

  const rules: LogicRule[] = [
    {
      id: 'r1',
      questionId: 'q1',
      condition: { operator: 'equals', value: 'deleted' },
      action: { type: 'Jump', targetQuestionId: 'q2' }, // q2 no longer exists
    },
  ];

  it('falls through when the jump target has been deleted', () => {
    const next = evaluateNextQuestion('q1', 'deleted', rules, questions);
    // q2 is gone; the evaluator must not crash. It should either fall through
    // to q3 or end the form — but never reference a nonexistent question.
    expect(next).not.toBe('q2');
    expect(next === null || next === 'q3').toBe(true);
  });
});

describe('Logic rules — No rules match', () => {
  const questions: Question[] = [
    { id: 'q1', type: 'Text', order: 1 },
    { id: 'q2', type: 'Text', order: 2 },
  ];

  const rules: LogicRule[] = [
    {
      id: 'r1',
      questionId: 'q1',
      condition: { operator: 'equals', value: 'special' },
      action: { type: 'Jump', targetQuestionId: 'q2' },
    },
  ];

  it('returns the next sequential question when no rule matches', () => {
    const next = evaluateNextQuestion('q1', 'ordinary', rules, questions);
    expect(next).toBe('q2');
  });

  it('returns null for the last question when no rule matches', () => {
    const next = evaluateNextQuestion('q2', 'anything', rules, questions);
    expect(next).toBeNull();
  });
});
