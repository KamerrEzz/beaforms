# API Contract - Goodform

## Data Model Overview
- `Organization`: { id, name }
- `User`: { id, email, role (Admin|Employee), organizationId }
- `Form`: { id, title, organizationId, status (Draft|Published|Archived), version }
- `Question`: { id, formId, type, required, order, settings }
- `Submission`: { id, formId, token, version, createdAt }
- `Answer`: { id, submissionId, questionId, value }

## Endpoints

### Auth
- `POST /api/auth/login` -> { token }
  - Errors: 401 Unauthorized

### Forms (Admin only)
- `GET /api/forms` -> { forms[] }
- `POST /api/forms` -> { form }
- `GET /api/forms/:id` -> { form, questions[], rules[] }
- `POST /api/forms/:id/publish` -> { version }

### Submissions (Public)
- `POST /api/forms/:id/submissions` -> { submissionId }
  - Errors: 400 Validation, 429 RateLimit

### Results (Admin/Employee)
- `GET /api/forms/:id/results` -> { submissions[] }
- `GET /api/forms/:id/export` -> CSV
