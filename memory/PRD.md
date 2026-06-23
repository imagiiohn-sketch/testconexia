# CONEXIA CLM — Product Requirements (MVP)

## Vision
Conexia CLM is a mobile-first enterprise Contract Lifecycle Management platform combining strict document control, interdepartmental workflows, real-time financial KPIs, field-evidence capture with immutable metadata, and an AI Copilot for contract analysis.

## Brand
- Identity: Dark teal `#1F4A4A` anchor, white surface, mono numerals
- Logo: Conexia (blueprint-meets-circuit `C`)
- Tagline: Software Engineering • Product Consulting

## MVP Modules Delivered

### 1. Smart Dashboard
- Hero with blueprint background + glass alert card
- 4 financial KPIs: Total Value, Executed, Retention, Penalties
- Semaphore list of vencimientos (verde <30d, amarillo 30–60d, rojo ≤7d)
- Workflow pipeline summary (draft / in_review / active)

### 2. Contracts Module
- Filter chips by lifecycle status (all, draft, in_review, approved, signed, active, expiring)
- Contract card: status pill, risk pill, value (mono), end date
- Detail screen: financial KPIs, progress bar, workflow stepper (Legal → Finanzas → Operaciones → Dirección), AI copilot, timeline, addenda list, mock e-signature

### 3. Field Evidence
- Grid of evidence tiles with GPS pill + timestamp
- Capture flow: camera/library, GPS via expo-location (fallback demo coords if denied), milestone link, contract link, immutable hash assigned on save

### 4. Workflow & Approvals
- 4-step sequential workflow per contract
- Approve/Reject mini-buttons; auto-rollup of contract status; rejected resets to draft

### 5. Addenda (Padre-Hijo)
- Adendas are children contracts with value_delta and end_date_delta_days
- Parent timeline shows addendum event; addenda listed in detail

### 6. AI Copilot (Claude Sonnet 4.6 via Universal Key)
- Analyzes contract text → JSON with summary, key_dates, financial_obligations, risk_clauses, overall_risk
- Stores `ai_analysis` on contract and emits timeline event

### 7. Auth & RBAC
- Emergent Google OAuth + dev bypass login for demo
- User stored with role and department; session in expo-secure-store / localStorage

## MOCKED Areas (for MVP)
- Notifications fan-out (Slack/Teams/WhatsApp/SMS) — semaphore is real; channel delivery is mocked
- E-signature (DocuSign/Adobe Sign) — sign endpoint sets `status=signed` with a mock audit hash
- OCR/Tesseract — not wired; AI Copilot accepts text input directly
- Document upload to S3 — base64 storage for evidence; long-term storage strategy documented but S3 not wired

## Stack
- Frontend: Expo SDK 54 + React Native 0.81 + expo-router 6
- Auth/storage: expo-secure-store / localStorage
- Backend: FastAPI + Motor (async MongoDB)
- AI: emergentintegrations → anthropic/claude-sonnet-4-6
- Imaging/GPS: expo-image-picker, expo-camera, expo-location

## Data Model (key entities)
- `users` { user_id, email, name, picture, role, department }
- `user_sessions` { session_token, user_id, expires_at, created_at } (TTL index)
- `contracts` { contract_id, title, counterparty, total_value, currency, start_date, end_date, status, workflow[], milestones[], executed/retention/penalty values, parent_contract_id, owner_id, timeline[], ai_analysis }
- `evidence` { evidence_id, contract_id, image_base64, latitude, longitude, accuracy_m, captured_by_*, captured_at, immutable_hash, milestone_name, note }

## Future (not in MVP)
- Real S3 + CDN signed uploads, BIM/CAD preview, document versioning (git-style locking), full OCR pipeline, Slack/Teams/WhatsApp/SMS fan-out, real DocuSign API, push notifications, template engine UI.
