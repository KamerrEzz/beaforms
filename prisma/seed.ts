/**
 * Prisma seed script.
 *
 * Creates realistic development data: organizations, users, forms with
 * diverse question types, submissions, and a failed notification job.
 *
 * Usage: npm run db:seed
 */

import { PrismaClient, FormStatus, QuestionType, UserRole, NotificationStatus } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.answer.deleteMany();
  await prisma.notificationJob.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.logicRule.deleteMany();
  await prisma.question.deleteMany();
  await prisma.form.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // --- Organizations ---
  const goodformInc = await prisma.organization.create({
    data: { name: 'Goodform Inc' },
  });

  const testCorp = await prisma.organization.create({
    data: { name: 'Test Corp' },
  });

  // --- Users ---
  const passwordHash = await hashPassword('password123');

  const adminGoodform = await prisma.user.create({
    data: {
      email: 'admin@goodform.local',
      passwordHash,
      role: UserRole.Admin,
      organizationId: goodformInc.id,
    },
  });

  const employeeGoodform = await prisma.user.create({
    data: {
      email: 'employee@goodform.local',
      passwordHash,
      role: UserRole.Employee,
      organizationId: goodformInc.id,
    },
  });

  const adminTestCorp = await prisma.user.create({
    data: {
      email: 'admin@testcorp.local',
      passwordHash,
      role: UserRole.Admin,
      organizationId: testCorp.id,
    },
  });

  // --- Published form with 6 question types ---
  const publishedForm = await prisma.form.create({
    data: {
      title: 'Customer Feedback Survey',
      organizationId: goodformInc.id,
      status: FormStatus.Published,
      version: 1,
      questions: {
        create: [
          {
            type: QuestionType.Text,
            order: 1,
            required: true,
            settings: { label: 'Your name' },
          },
          {
            type: QuestionType.Email,
            order: 2,
            required: true,
            settings: { label: 'Email address' },
          },
          {
            type: QuestionType.Select,
            order: 3,
            required: true,
            settings: {
              label: 'How did you hear about us?',
              options: ['Google', 'Social media', 'Friend', 'Other'],
            },
          },
          {
            type: QuestionType.MultiSelect,
            order: 4,
            required: false,
            settings: {
              label: 'What features do you value?',
              options: ['Ease of use', 'Design', 'Performance', 'Support', 'Price'],
            },
          },
          {
            type: QuestionType.Rating,
            order: 5,
            required: true,
            settings: { label: 'Overall satisfaction', min: 1, max: 5 },
          },
          {
            type: QuestionType.LongAnswer,
            order: 6,
            required: false,
            settings: { label: 'Any additional comments?' },
          },
        ],
      },
    },
    include: { questions: true },
  });

  // --- Draft form ---
  await prisma.form.create({
    data: {
      title: 'Employee Onboarding Survey (Draft)',
      organizationId: goodformInc.id,
      status: FormStatus.Draft,
      version: 0,
      questions: {
        create: [
          {
            type: QuestionType.Text,
            order: 1,
            required: true,
            settings: { label: 'Full name' },
          },
        ],
      },
    },
  });

  // --- Archived form ---
  await prisma.form.create({
    data: {
      title: 'Q1 2026 Survey (Archived)',
      organizationId: goodformInc.id,
      status: FormStatus.Archived,
      version: 3,
      questions: {
        create: [
          {
            type: QuestionType.Rating,
            order: 1,
            required: true,
            settings: { label: 'Rate your experience', min: 1, max: 10 },
          },
        ],
      },
    },
  });

  // --- 10 Submissions with answers ---
  const questions = publishedForm.questions;

  for (let i = 1; i <= 10; i++) {
    const submission = await prisma.submission.create({
      data: {
        formId: publishedForm.id,
        token: `sub-token-${String(i).padStart(3, '0')}`,
        version: 1,
      },
    });

    // Answer for each question
    const answerPairs: Array<[string, string | number | string[]]> = [
      [questions[0].id, `User ${i}`],
      [questions[1].id, `user${i}@example.com`],
      [questions[2].id, i % 2 === 0 ? 'Google' : 'Social media'],
      [questions[3].id, ['Ease of use', 'Design'].slice(0, (i % 3) + 1)],
      [questions[4].id, Math.min(5, Math.max(1, (i % 5) + 1))],
    ];

    // Long answer only for first 3 submissions
    if (i <= 3) {
      answerPairs.push([questions[5].id, `Great experience #${i}`]);
    }

    for (const [questionId, value] of answerPairs) {
      await prisma.answer.create({
        data: {
          submissionId: submission.id,
          questionId,
          value,
        },
      });
    }
  }

  // --- 1 failed notification job (for retry testing) ---
  const firstSubmission = await prisma.submission.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (firstSubmission) {
    await prisma.notificationJob.create({
      data: {
        submissionId: firstSubmission.id,
        channel: 'email',
        status: NotificationStatus.failed,
        attempts: 3,
        lastAttempt: new Date(),
        payload: {
          error: 'SMTP connection timeout after 30s',
          to: 'user1@example.com',
          subject: 'Response received: Customer Feedback Survey',
        },
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  Organizations: ${goodformInc.id}, ${testCorp.id}`);
  console.log(`  Users: admin@goodform.local, employee@goodform.local, admin@testcorp.local`);
  console.log(`  Published form: ${publishedForm.id} (${questions.length} questions)`);
  console.log(`  Submissions: 10`);
  console.log(`  Failed notification job: 1 (for retry testing)`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
