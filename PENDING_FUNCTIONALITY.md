# Pending functionality

Controls from the October 2026 designs that are on screen but don't fully work yet, or were left out because nothing backs them. Each needs a backend change (or a product decision) before it can do what the design implies. Revisit at the end of the UI pass.

## Shown, but not doing what the design implies

| Tab | Control | What it does now | What's missing |
|---|---|---|---|
| Contacts (grid) | **Type** row pencil | Shows "Type is a custom field in your CRM — change it there." | Type is a GHL custom field; `PATCH /api/contacts/:id` rejects it (server `contactPatch` drops it). Needs a custom-field write path. |
| Contacts (list) | **Tasks** pill chevron (`4 tasks ˅`) | Opens the contact's record | The list returns only `openTaskCount`, not the tasks. A dropdown of tasks needs them per contact. |
| Contacts (list) | **Notes** pill chevron (`1 note ˅`) | Opens the contact's record | The list returns only `noteCount`, not the notes. Same as above. |
| Contacts (list) | **No deals** pill chevron | Nothing (inert) | Decorative; there's nothing to list. Could open a "link a deal" flow if one is wanted. |
| Notes (grid + rows) | **View BUSINESS** row | Appears only when the note has `business: { id, name }` | Unverified whether `GET /api/notes` returns `business` on notes. Check the backend. |
| Tasks | Deal-linking control on a task | Switched off (`TASK_DEAL_EDITING = false` in `TasksTab.jsx`) | GHL refuses `POST /associations/relations` over OAuth ("Relations cannot be modified via OAuth channel"). Platform restriction. |

## Left out of the UI for now

| Tab | Control in the design | Why it's left out | What would enable it |
|---|---|---|---|
| Contacts | **Add contact** button | No create-contact API (`contactsAPI` has list/get/update only) | `POST /api/contacts` on the backend |
| Contacts (grid + list) | **Selection checkboxes** (per card, per row, header select-all) | No bulk action to apply to a selection | Decide on bulk actions (e.g. bulk tag, bulk owner) |
| Contacts (grid) | **Show on cards → Tasks / Notes** toggles | Only counts come per contact, so the toggle would show nothing | Contacts list returning each contact's open tasks and notes |
| Notes | **Search** box | Unknown whether `/api/notes` accepts `q` (Tasks search is server-side) | Confirm or add `q` support on `/api/notes` |
