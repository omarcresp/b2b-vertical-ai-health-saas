# PRD: WhatsApp Scheduling Agent MVP (CDMX + Bogota Dental)

## Overview
Build an MVP for independent dental clinics in CDMX and Bogota that reduces no-shows and front-desk workload through WhatsApp-based appointment confirmation, rescheduling, and cancellation.

The MVP uses a custom scheduling database, dynamic single-provider availability, and a Kapso-powered WhatsApp agent that only books real available slots.

## Goals
- Reduce no-show rate for pilot clinics within first 30 days.
- Automate confirm/reschedule/cancel flows over WhatsApp with safe booking logic.
- Prove paid demand with 5 founder-led paid pilots across CDMX and Bogota.
- Produce one quantified ROI case study for repeatable sales.

## Quality Gates

These commands must pass for every user story:
- `bun run typecheck` - Type checking
- `bun run build` - Production build
- `bun run lint` - Linting/static checks
- `bun run format:check` - Formatting check

For UI stories, also include:
- Verify in browser (manual visual verification)

## User Stories

look at `./prd.json`

## Functional Requirements
- FR-1: The system must support one specialty (dental) across CDMX and Bogota pilots.
- FR-2: The system must support confirm, reschedule, and cancel over WhatsApp.
- FR-3: The scheduler must compute dynamic availability from provider weekly schedule and real appointment conflicts.
- FR-4: The booking layer must prevent double-booking under concurrent requests.
- FR-5: The WhatsApp layer must support outbound template reminders and inbound response handling.
- FR-6: The agent must call scheduling tools for decisions that change appointments.
- FR-7: The system must persist conversation state per patient thread.
- FR-8: The system must support human handoff from any conversation.
- FR-9: The system must log message and appointment lifecycle events needed for debugging and ROI reporting.
- FR-10: Pilot reporting must produce weekly outcome metrics per clinic.

## Non-Goals (Out of Scope)
- EHR/PM integrations (including Google Calendar sync) in MVP.
- Multi-provider routing and resource/room scheduling.
- Variable appointment duration by procedure type.
- Intake forms, payments, deposits, insurance workflows.
- Voice channel, email channel, marketing campaigns.
- Advanced BI dashboards beyond pilot reporting essentials.

## Technical Considerations
- Keep domain logic in Convex (`convex/schema.ts`, `convex/scheduling.ts`, `convex/http.ts`, `convex/whatsapp*.ts`).
- Use idempotent webhook/event processing to handle retries safely.
- Keep AI constrained: intent + extraction + tool selection only; deterministic booking enforcement in backend.
- Design data model with future external calendar integration points (external IDs, sync status fields) but do not implement sync now.
- Localize patient messaging to Spanish (neutral LATAM) for MVP.

## Success Metrics
- 5 paid pilot clinics activated (booking + reminders live) within 8 weeks.
- >=70% reminder response rate over WhatsApp in active pilots.
- >=40% of reschedules completed without staff intervention.
- >=15% relative no-show reduction vs each clinic baseline after 30 days.
- <=5 minutes median time from patient reschedule request to confirmed new slot.
- At least 1 documented case study with quantified ROI.

## Open Questions
- Final legal/compliance checklist for patient messaging consent and opt-out handling in Mexico and Colombia.
- Exact definition of inbound call baseline metric per clinic (manual count vs phone logs).
- Handoff SLA target (for example, "human response within X minutes") for pilot contracts.
- Pricing model after pilot (flat monthly vs per active provider vs usage-based).
