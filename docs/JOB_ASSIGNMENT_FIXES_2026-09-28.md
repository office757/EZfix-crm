# Job assignment, user removal and estimate order

- Job edits derive the technician name from the chosen team ID and retain inactive historical assignees while editing unrelated fields.
- Dispatch jobs use a server-validated five-minute offer. Reassignment releases the old technician before a replacement accepts, only before arrival; stale forms are rejected. Offers remain private until acceptance.
- Team removal archives the row and marks it inactive. Existing JWTs immediately lose CRM authorization. Historical job and financial references remain intact; owner accounts cannot be removed here. This does not delete the underlying Auth identity.
- New estimates and additional options require an open job with an active assigned technician. A database trigger enforces this for all insertion paths and atomically links the first estimate. Historical estimates remain editable.

Validation: 18 database assertions in a transaction that rolls back all synthetic fixtures; production job-form handlers exercised in Node; complete release pipeline passes. No real user was removed and no test notification sent. Browser visual verification is unavailable in this runtime because browser socket creation is denied.
