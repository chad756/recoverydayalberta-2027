# Admin guide – running Recovery Day with the new site

For event staff. No technical knowledge needed. Log in at **/admin/** with your
email, password and the 6-digit code from your authenticator app.

**Roles**

| Role | Can do |
|---|---|
| Finance | Invoices, payments, receipts, refunds, sponsor export |
| Admin | Everything Finance can, plus applications, documents, booths, volunteers, announcements |
| Super Admin | Everything, plus settings, prices, staff roles, privacy tools, new year |

All times are Edmonton time. All money is CAD. There is no GST on anything.

---

## The season at a glance

1. **Settings** (Super Admin): dates, venues, prices, rules. The public pages pick up the dates overnight.
2. Vendors apply in their portal → you **review** → **Accept** creates a **draft invoice**.
3. You check the draft → **Approve & Send** → vendor gets the PDF + Pay now link.
4. Vendor pays on Last Door's page → payment matches automatically → receipt emailed.
5. Vendors upload insurance / food permits → you **approve** them.
6. Upload the **site map**, place **booths**, assign vendors → vendors see their spot.
7. Volunteers sign up on the public page → **Auto-schedule** → check → **Publish**.
8. Event day: **check-in** volunteers. After: export the sponsor master.

---

## Dashboard

Shows money invoiced / paid / owing, the **To do** list (applications to review,
drafts to send, payments to check, documents to approve — cancellation requests are counted with applications)
and volunteer numbers per city. Click any line to go straight there.

## Applications

- Filter by status or city; open one to see everything the vendor entered.
- **Accept** → the application is accepted and a **draft invoice** is created
  automatically with the right prices, deposit and due date. Nothing is sent yet.
- **Request changes** → the vendor gets an email and can edit and re-submit.
- **Waitlist** / **Decline** → you'll be asked for a short reason (it's emailed).
- **Documents** on the application: open, then **Approve** or **Reject** (with a reason).
- **Cancellation requests** appear on the dashboard. Open the invoice → **Cancel / refund**.

## Invoices

- **To review (drafts)** is the main list. Open a draft:
  - Change the bill-to details, lines or amounts if needed. Add a **discount**
    line with a negative amount (e.g. `-100.00`).
  - **Recalculate deposit and due date** after changing lines, then **Save draft**.
  - **Preview PDF** to see exactly what the vendor will get.
  - **Approve & Send** emails the PDF and pay link. After sending, lines are
    locked; to change a sent invoice, **Void** it (only if nothing is paid) and
    create a new one.
- **New manual invoice**: for sponsors who didn't apply online (grants, stage
  sponsors…). Choose or add the organization, describe the item, set the amount.
- **Resend email** sends the same invoice again (e.g. to a new contact).
- **Sponsor sheet columns typed by staff** (bottom of each invoice): RCC, LED ads,
  article, notes etc. — these fill the columns in the sponsor master export.

Invoice numbers run 2027CD001, 2027CD002… and are never reused.

## Payments

Payments come in three ways:

1. **Automatically** from the Last Door payment page (see `MAJOR-TOM.md`).
   They appear under **Auto-matched – quick double-check**. Glance at them and
   press **Looks right**, or **Void** if wrong.
2. **Unmatched**: a payment arrived but we couldn't tell which invoice (no
   number, wrong amount). Press **Assign to invoice**, choose the invoice, and
   it is recorded with a receipt. Press **Ignore** for test or unrelated payments.
3. **Vendor reports** ("I've paid, but it's not showing"): check the Last Door
   account. If the money is there → **Confirm and record**. If not → **Not found**
   and email the vendor.

**Record a payment** – cheques, e-transfers, cash, card by phone. Choose the
invoice, amount and date; "Received" fills in the column M wording automatically
(you can change it). A numbered receipt (R-2027-0001…) is created and emailed.

**Import payments** – upload a CSV/Excel payment report, or the shared sponsor
sheet in the 2026 layout (we read column C invoice # and column M Received).
You see a preview of every row first; nothing changes until you press **Apply**.

**Cancel / refund** (from an invoice): enter the cancellation date and the
calculator shows the refund by the policy, line by line. You can change the
amount, but you must write why. The booking is cancelled, the booth released and
the vendor emailed. The refund itself is paid by Last Door finance as usual —
enter the date it was sent.

## Booths & site maps

1. Choose the city → **Upload site map** (PNG or JPG; save a PDF map as PNG first).
2. **Add booths on the map** → click where each booth is → type the number,
   size, type and zone. Press the button again to stop adding.
3. Assign a vendor with the drop-down in the booth list (or click a pin).
   The vendor sees their booth and a map with their spot in red.
4. **Export booth list (Excel)** or **Print booth list** for load-in.

## Volunteers

Choose the city at the top.

- **Sign-ups** tab: everyone who signed up, their preferences and shifts.
  **Export sign-up list (Excel)**.
- **Schedule** tab:
  - **Auto-schedule** fills empty shifts (preferences, availability, returning
    volunteers first, groups together, no double-booking). Zone Leads, guards
    and first aid (marked "By hand") are never auto-filled.
  - Change anyone with the drop-down. Manual changes are **Locked** so
    auto-schedule won't move them. Untick Locked to let it.
  - **Publish and email volunteers**: each volunteer gets their shift(s) and a
    private link to **Confirm** or **Decline**. A decline frees the slot; run
    Auto-schedule again to refill it, then Publish again (only new people are emailed).
  - **Export schedule (2026 layout)**: the same layout as the 2026 schedule sheet.
- **Event-day check-in** tab: **Check in** when someone arrives, **Check out**
  when they leave. Works on a phone.

## Exports

- **Sponsor master (.xlsx)**: same columns and headers as the 2026 sheet
  (A–CD) plus new columns CE–CL, and the Sponsor Emails sheet.
- Volunteer sign-up lists and schedules per city.

Exports contain personal information — save them only on SharePoint.

## Announcements

Post a message to all vendors or one city's vendors. It appears in their portal.

## Settings & users (Super Admin)

- **Festival dates and places** — the portals use the new values straight
  away; the public pages update overnight (or run the *Deploy site* Action on
  GitHub to update them now).
- **Products and prices** — new invoices use new prices; sent invoices never change.
- **Rules and text** — deposit, due dates, refund rules, policy wording, pay
  link, emails, reminders. Each is a small block of text in JSON format; keep
  the quotes and commas. Items with a **Confirm** badge are waiting for a decision.
- **Staff accounts** — change roles or disable an account.
- **Privacy tools** — delete a volunteer's data on request.
- **Start 2028** — after the 2027 books are closed. Keeps prices and shift
  templates, restarts numbering at 2028CD001, clears dates.

## Audit log

Every change to applications, invoices, payments, receipts, booths, settings
and schedules: who, when, what changed. It can't be edited.

## Automatic jobs

- **Reminders** (daily, 9 am): deposit reminder 7 days after an invoice is
  sent; balance reminders 7 days and 1 day before the due date; an overdue
  notice the day after. Each is sent once. Booths are never released
  automatically — that's always your decision.
- **Privacy clean-up**: volunteer records 24 months and documents 12 months
  after the event. Financial records are kept 7 years.
- **Backup** every Sunday (encrypted, kept 30 days in GitHub).
