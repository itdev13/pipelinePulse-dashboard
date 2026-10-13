# Pending functionality

Controls from the October 2026 designs that are on screen but don't fully work yet. Each needs a backend change (or a product decision) before it can do what the design implies. Revisit at the end of the UI pass, then wire each one up or remove it.

## Shown, but not doing what the design implies

| Tab | Control | What it does now | What's missing |
|---|---|---|---|
| Contacts | **Add contact** button | Shows "Adding contacts from here is not available yet — add them in your CRM" | No create-contact API (`contactsAPI` has list/get/update only). Needs `POST /api/contacts`. |
| Contacts (grid + list) | **Selection checkboxes** (per card, per row, header select-all) | Selecting shows the bulk bar. **Add tag** and **Clear** work. Bulk Change type and Export were removed (Oct 2026, client request) | See the bulk actions below. |
| Contacts | Bulk **Assign owner** | Says "not available yet — do it in your CRM" | Nothing in the frontend writes a contact's owner. Confirm whether `PATCH /api/contacts/:id` accepts `assignedTo`; if so, loop it per contact like Add tag. |
| Contacts | Bulk **Delete** | Says "not available yet" | No delete-contact API. Needs `DELETE /api/contacts/:id` (and a confirm dialog, since it can't be undone). |
| Contacts (grid) | **Type** row pencil | Shows "Type is a custom field in your CRM — change it there." | Type is a GHL custom field; `PATCH /api/contacts/:id` rejects it (server `contactPatch` drops it). Needs a custom-field write path. |
| Contact record | **Contact type** dropdown | You can pick Lead or Customer, but Save never sends it (it is left out of the save on purpose) | Was already the case before the redesign. One code comment says GHL accepts `type` on the contact, another says the update endpoint drops it. Confirm what the backend's `contactPatch` does with `contactType`, then either send it or make the cell read-only. |
| Contact record | **Timezone** cell | Editable and sent with Save | New in the redesign. The frontend maps `timezone` both ways, but it is unconfirmed that the backend's `contactPatch` accepts it. If it doesn't, Save shows the error. |
| Contacts (grid) | **Show on cards → Tasks / Notes** | Adds a count row ("3 open tasks · View TASK", "2 notes · View NOTE") that opens the contact | The design lists each task and note. The contacts list returns only `openTaskCount` / `noteCount`, not the items. |
| Contacts (list) | **Tasks** pill chevron (`4 tasks ˅`) | Opens the contact's record | Same as above: a dropdown of tasks needs them per contact. |
| Contacts (list) | **Notes** pill chevron (`1 note ˅`) | Opens the contact's record | Same as above, for notes. |
| Contacts (list) | **No deals** pill chevron | Nothing (inert) | Decorative; there's nothing to list. Could open a "link a deal" flow if one is wanted. |
| Notes | **Search** box | Sends `q` to `GET /api/notes` | Unconfirmed whether the backend honours `q` (Tasks search does). If it doesn't, the list stays unfiltered. |
| Notes (grid + rows) | **View BUSINESS** row | Appears only when the note has `business: { id, name }` | Unverified whether `GET /api/notes` returns `business` on notes. Check the backend. |

## Blocked by the platform

| Tab | Control | Status |
|---|---|---|
| Tasks | Linking a task to a deal | Switched off (`TASK_DEAL_EDITING = false` in `TasksTab.jsx`). GHL refuses `POST /associations/relations` over OAuth ("Relations cannot be modified via OAuth channel"). Reading a task's deals still works. |
