# Goodform API Reference

All endpoints return JSON unless otherwise noted. The base URL is the application root (default: `http://localhost:4321`).

## Authentication

### `POST /api/auth/login`

Authenticate a user and receive a session token.

**Auth:** None

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | yes | User email |
| `password` | string | yes | User password |

**Success response (200):**

```json
{
  "token": "session-token-string"
}
```

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Invalid request" }` | Missing or malformed fields |
| 401 | `{ "error": "Invalid email or password" }` | Wrong credentials |
| 429 | `{ "error": "Too many login attempts. Try again later." }` | Rate limit exceeded (5 per 15 min per email) |

**Example:**

```bash
curl -X POST http://localhost:4321/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "secret"}'
```

---

## Forms (Admin only)

All form endpoints require an authenticated Admin user. Pass the session token as a cookie or in the `Authorization` header.

### `GET /api/forms`

List all forms for the authenticated user's organization.

**Auth:** Admin

**Success response (200):**

```json
{
  "forms": [
    {
      "id": "clx1234567890",
      "title": "Customer Feedback",
      "status": "Published",
      "version": 3,
      "createdAt": "2026-01-15T10:30:00.000Z"
    }
  ]
}
```

**Example:**

```bash
curl http://localhost:4321/api/forms \
  -H "Authorization: Bearer <session-token>"
```

---

### `POST /api/forms`

Create a new form.

**Auth:** Admin

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Form title |
| `questions` | array | no | Array of question objects |
| `rules` | array | no | Array of logic rule objects |

Question object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | One of: `Text`, `Email`, `Select`, `MultiSelect`, `Rating`, `LongAnswer` |
| `order` | integer | yes | Display order (1-indexed) |
| `required` | boolean | no | Whether the question is required (default: `false`) |
| `settings` | object | no | Question-type-specific configuration |

Logic rule object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `questionId` | string | yes | ID of the question this rule applies to |
| `condition` | object | yes | Condition to evaluate |
| `action` | object | yes | Action to take (`Jump` or `End`) |

**Success response (201):**

```json
{
  "form": {
    "id": "clx1234567890",
    "title": "Customer Feedback",
    "status": "Draft",
    "version": 0
  }
}
```

**Example:**

```bash
curl -X POST http://localhost:4321/api/forms \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Customer Feedback", "questions": [{"type": "Text", "order": 1, "required": true, "settings": {"label": "Your name"}}]}'
```

---

### `GET /api/forms/:id`

Get a form with its questions and logic rules.

**Auth:** Admin

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Form ID |

**Success response (200):**

```json
{
  "form": {
    "id": "clx1234567890",
    "title": "Customer Feedback",
    "status": "Draft",
    "version": 0
  },
  "questions": [
    {
      "id": "clx1234567891",
      "type": "Text",
      "order": 1,
      "required": true,
      "settings": {"label": "Your name"}
    }
  ],
  "rules": []
}
```

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 404 | `{ "error": "Form not found" }` | Form does not exist or belongs to another organization |

**Example:**

```bash
curl http://localhost:4321/api/forms/clx1234567890 \
  -H "Authorization: Bearer <session-token>"
```

---

### `POST /api/forms/:id/publish`

Publish a form, creating an immutable snapshot. Returns the new version number.

**Auth:** Admin

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Form ID |

**Success response (200):**

```json
{
  "version": 1
}
```

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 404 | `{ "error": "Form not found" }` | Form does not exist |
| 409 | `{ "error": "Form must have at least one question" }` | No questions defined |

**Example:**

```bash
curl -X POST http://localhost:4321/api/forms/clx1234567890/publish \
  -H "Authorization: Bearer <session-token>"
```

---

## Submissions (Public)

### `POST /api/forms/:id/submissions`

Submit a response to a published form. This endpoint is public and does not require authentication.

**Auth:** None

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Form ID (must be published) |

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `answers` | array | yes | Array of answer objects |
| `token` | string | no | Unique token (auto-generated if omitted) |

Answer object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `questionId` | string | yes | ID of the question being answered |
| `value` | any | yes | Answer value (string, array, or number depending on question type) |

**Success response (201):**

```json
{
  "submissionId": "clx1234567890"
}
```

**Error responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Validation failed", "details": [...] }` | Missing required answers or invalid data |
| 404 | `{ "error": "Form not found" }` | Form does not exist or is not published |
| 429 | `{ "error": "Rate limit exceeded" }` | Too many submissions from the same source |

**Example:**

```bash
curl -X POST http://localhost:4321/api/forms/clx1234567890/submissions \
  -H "Content-Type: application/json" \
  -d '{"answers": [{"questionId": "clx1234567891", "value": "Jane Doe"}]}'
```

---

## Results (Admin/Employee)

### `GET /api/forms/:id/results`

Get all submissions for a form.

**Auth:** Admin or Employee (same organization)

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Form ID |

**Success response (200):**

```json
{
  "submissions": [
    {
      "id": "clx1234567890",
      "token": "abc123",
      "version": 1,
      "createdAt": "2026-01-15T10:30:00.000Z",
      "answers": [
        {
          "questionId": "clx1234567891",
          "value": "Jane Doe"
        }
      ]
    }
  ]
}
```

**Example:**

```bash
curl http://localhost:4321/api/forms/clx1234567890/results \
  -H "Authorization: Bearer <session-token>"
```

---

### `GET /api/forms/:id/export`

Export submissions as a CSV file.

**Auth:** Admin or Employee (same organization)

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Form ID |

**Success response (200):**

Returns a CSV file with `Content-Type: text/csv`.

**Example:**

```bash
curl http://localhost:4321/api/forms/clx1234567890/export \
  -H "Authorization: Bearer <session-token>" \
  -o submissions.csv
```

---

## GDPR & Data Management (Admin only)

### `POST /api/gdpr/data-export`

Request an export of all data for the authenticated user's organization. The export is processed asynchronously and a download URL is returned.

**Auth:** Admin

**Request body:**

Empty. The organization is derived from the authenticated user's session.

**Success response (200):**

```json
{
  "downloadUrl": "/downloads/export-abc123.zip"
}
```

**Example:**

```bash
curl -X POST http://localhost:4321/api/gdpr/data-export \
  -H "Authorization: Bearer <session-token>"
```

---

### `POST /api/gdpr/data-deletion`

Request deletion of all data for the authenticated user's organization. Returns 202 Accepted; actual deletion is processed asynchronously by a background worker.

**Auth:** Admin

**Request body:**

Empty. The organization is derived from the authenticated user's session.

**Success response (202):**

```json
{
  "message": "Deletion request accepted"
}
```

**Example:**

```bash
curl -X POST http://localhost:4321/api/gdpr/data-deletion \
  -H "Authorization: Bearer <session-token>"
```

---

## Notification Management (Admin only)

### `GET /api/submissions/:id/notifications`

Get the notification status (email and webhook) for a specific submission.

**Auth:** Admin (must own the submission's form)

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Submission ID |

**Success response (200):**

```json
{
  "email": {
    "status": "delivered",
    "lastAttempt": "2026-01-15T10:35:00.000Z"
  },
  "webhook": {
    "status": "failed",
    "lastAttempt": "2026-01-15T10:35:00.000Z"
  }
}
```

**Example:**

```bash
curl http://localhost:4321/api/submissions/clx1234567890/notifications \
  -H "Authorization: Bearer <session-token>"
```

---

### `POST /api/submissions/:id/notifications/email/retry`

Retry sending the email notification for a submission.

**Auth:** Admin (must own the submission's form)

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Submission ID |

**Success response (202):**

```json
{
  "message": "Email retry queued"
}
```

**Example:**

```bash
curl -X POST http://localhost:4321/api/submissions/clx1234567890/notifications/email/retry \
  -H "Authorization: Bearer <session-token>"
```

---

### `POST /api/submissions/:id/notifications/webhook/retry`

Retry sending the webhook notification for a submission.

**Auth:** Admin (must own the submission's form)

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Submission ID |

**Success response (202):**

```json
{
  "message": "Webhook retry queued"
}
```

**Example:**

```bash
curl -X POST http://localhost:4321/api/submissions/clx1234567890/notifications/webhook/retry \
  -H "Authorization: Bearer <session-token>"
```
