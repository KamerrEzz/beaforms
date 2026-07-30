/**
 * Conditional logic rule evaluator for form flow.
 *
 * Resolves jumps during submission: when the user answers a question, the
 * evaluator checks if any rule matches and returns the next question ID —
 * or null to end the form.
 *
 * Loop prevention: a jump to a question at the same or earlier order is
 * ignored, preventing infinite cycles. Deleted question targets are also
 * silently skipped (fall through to sequential next).
 */

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

function matchCondition(
  answer: string | number | string[],
  condition: { operator: string; value: string | number }
): boolean {
  switch (condition.operator) {
    case 'equals':
      if (Array.isArray(answer)) {
        return answer.includes(String(condition.value));
      }
      return String(answer) === String(condition.value);
    case 'contains':
      if (Array.isArray(answer)) {
        return answer.some((v) => String(v).includes(String(condition.value)));
      }
      return String(answer).includes(String(condition.value));
    case 'greaterThan':
      return Number(answer) > Number(condition.value);
    default:
      return false;
  }
}

/**
 * Given the current question, its answer, all rules, and the question list,
 * returns the ID of the next question to present, or null if the form ends.
 */
export function evaluateNextQuestion(
  currentQuestionId: string,
  answer: string | number | string[],
  rules: LogicRule[],
  questions: Question[]
): string | null {
  const current = questions.find((q) => q.id === currentQuestionId);
  if (!current) return null;

  const matchingRules = rules.filter(
    (r) => r.questionId === currentQuestionId && matchCondition(answer, r.condition)
  );

  for (const rule of matchingRules) {
    if (rule.action.type === 'End') {
      return null;
    }

    if (rule.action.type === 'Jump') {
      const target = questions.find((q) => q.id === rule.action.targetQuestionId);
      if (!target) continue;

      // Prevent loops: skip jumps to same or earlier question in order.
      if (target.order <= current.order) continue;

      return target.id;
    }
  }

  // No rule matched — fall through to the next sequential question.
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex((q) => q.id === currentQuestionId);

  if (currentIndex === -1 || currentIndex === sorted.length - 1) {
    return null;
  }

  return sorted[currentIndex + 1].id;
}
