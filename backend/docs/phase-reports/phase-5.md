# Phase 5 report – Messaging & notifications

## Built
- Conversations per (request, pharmacy), created automatically on clarification or offer; list with unread counts and last message; cursor-paginated messages; send; mark read; closed automatically when the request ends or another offer is accepted.
- Strict access: patient + active staff of that pharmacy; everyone else 404; admins 403 (justified grants arrive with Phase 9).
- Clarification flow: question → CLARIFICATION_REQUIRED → `CLARIFICATION_ANSWER` → OFFER_AVAILABLE (if an offer is pending) or AWAITING_PHARMACY_RESPONSE; follow-up questions from the chat.
- Substitution proposals: SYSTEM message carrying `offer_id` + `offer_item_ids`, decided per item through the approval endpoint.
- Message safety: max length, per-user rate limit, phone-number and blocked-word filters (settings), attachment rules; message content never logged.
- SYSTEM messages (i18n keys) for request status changes and offers.
- Notifications: event-driven (EventEmitter) + job queue (BullMQ with Redis, in-process fallback); IN_APP, PUSH (`IPushProvider` mock), SMS, EMAIL; ar/fr templates with references only (no medicine names); per-user channel preferences and muted types; retries with exponential backoff; dead letters (`job_dead_letters`, notification FAILED + `dead_lettered_at`).
- Realtime: Socket.IO `/realtime` namespace, JWT + live-session authentication, rooms per user and pharmacy, events `message.new`, `offer.new`, `request.status_changed`, `order.status_changed`, `delivery.status_changed`, `notification.new`; sockets of revoked sessions are disconnected.

## Endpoints
`GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `POST /conversations/:id/read`, `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET|PATCH /notifications/preferences` + Socket.IO `/realtime`.

## Migration
`0008_messaging_notifications.sql` – `conversations.last_message_at`, `messages.metadata`, notification delivery tracking columns, `notification_preferences`, `job_dead_letters`.

## Tests
`test/messaging.e2e-spec.ts` (8): access control (patient, own pharmacy, other patient, other pharmacy, admin), clarification flow incl. pending offer and follow-up question, answer without offers, safety rules (phone, length, empty, attachment purpose, rate limit), cursor pagination + read marks + attachment sharing, notifications (Arabic template, reference only, no medicine name in push, unread count, read/read-all, preferences), retry → dead letter, realtime (unauthenticated rejected, events delivered, logout disconnects).

## Assumptions
1. The app sends `CLARIFICATION_ANSWER` when replying to a question; plain TEXT does not change the request status.
2. All active staff (incl. assistants) can read and write in their pharmacy's conversations; prescription images stay restricted to OWNER/PHARMACIST.
3. SMS is used only for a few high-value events (question, offer, delivery code, refund, account) to limit cost; configurable later per type.
4. Realtime authentication is checked at connection time and on session revocation, not on every event.
5. Socket.IO runs single-instance; multi-instance needs the Redis adapter.

## Open questions
- Whether pharmacy–patient chat about prescriptions requires specific retention / archiving rules.
- SMS sender ID / provider agreement in Algeria (no real provider integrated).
