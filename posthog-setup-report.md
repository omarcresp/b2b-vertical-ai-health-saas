<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into this B2B vertical SaaS for medical clinic scheduling. `posthog-js` and `@posthog/react` were installed, the `PostHogProvider` was added to the TanStack Router root route (`__root.tsx`), and a Vite reverse proxy was configured so all PostHog traffic routes through `/ingest` to avoid ad-blockers. Users are identified by their WorkOS email/ID on every authenticated session load, and `posthog.reset()` is called on sign-out to cleanly separate sessions. Ten events were instrumented across six files, covering the full activation funnel (sign-in → setup → first appointment), appointment lifecycle management, and error capture on critical mutations.

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User authenticated via WorkOS and landed in the app. Triggers `posthog.identify()` with email/name. | `src/routes/_authed.tsx` |
| `user_signed_out` | User clicked sign out. Triggers `posthog.reset()` to clear the session. | `src/features/setup/components/AuthButton.tsx` |
| `setup_submitted` | Clinic/provider configuration saved successfully. Includes clinic name, city, duration, horizon, window count, and resulting clinic slug. | `src/features/setup/hooks/useSetupModel.ts` |
| `setup_submit_failed` | Setup save failed (validation or server error). Includes error message. Also calls `captureException`. | `src/features/setup/hooks/useSetupModel.ts` |
| `setup_template_applied` | User applied a schedule preset template. Includes `template_id`. | `src/features/setup/components/PlannerSimulatorWorkspace.tsx` |
| `schedule_window_added` | User added an availability window to the weekly schedule. Includes day of week and current window count. | `src/features/setup/components/PlannerSimulatorWorkspace.tsx` |
| `appointment_created` | Owner booked a new patient appointment. Includes clinic slug, provider name, date, and slot timestamp. | `src/features/setup/components/AppointmentManager.tsx` |
| `appointment_create_failed` | Appointment creation failed. Includes error message. Also calls `captureException`. | `src/features/setup/components/AppointmentManager.tsx` |
| `appointment_confirmed` | Owner confirmed a pending appointment. Includes appointment ID. | `src/features/setup/components/AppointmentManager.tsx` |
| `appointment_cancelled` | Owner cancelled an appointment. Includes appointment ID. | `src/features/setup/components/AppointmentManager.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- 📊 **Dashboard — Analytics basics**: https://us.posthog.com/project/320189/dashboard/1298342
- 🔽 **Activation Funnel: Sign-in → Setup → First Appointment**: https://us.posthog.com/project/320189/insights/ogmErgcK
- 📈 **Appointment Volume: Created vs Confirmed vs Cancelled**: https://us.posthog.com/project/320189/insights/YQ2GJT1U
- 📉 **Setup Save Success vs Failure**: https://us.posthog.com/project/320189/insights/TKrZHcxT
- 📊 **Weekly Sign-ins vs Sign-outs**: https://us.posthog.com/project/320189/insights/CcA7cM39
- 🗂️ **Schedule Template Popularity**: https://us.posthog.com/project/320189/insights/5qe5MNd0

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-react-tanstack-router-file-based/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
