# Finance guide for treasurers

This guide explains how money is recorded, checked and reported in the PRAYASH
portal. It is written for treasurers and administrators.

## The rules the system enforces

- **Every rupee is a transaction.** Contributions, donations, expenses,
  refunds, transfers between accounts, allocations to projects and opening
  balances are each recorded as an individual ledger entry. Totals are always
  calculated from entries — nobody types a balance in.
- **Pending until verified.** New entries are *pending* and do not count in
  any balance or report until they are verified.
- **Four eyes.** With the default *Finance controls* (Settings), the person who
  recorded or last edited an entry cannot verify it, and the person who
  prepared a public report cannot publish it. Keep at least two people with
  finance roles.
- **Nothing is deleted or rewritten.** A verified entry can never be edited or
  deleted. Mistakes are corrected with a **reversal** (an equal and opposite
  entry linked to the original) and, if needed, a corrected **replacement**
  entry. Rejected entries stay visible with the reason.
- **Evidence.** Expenses, refunds and opening balances need a supporting
  document (bill, receipt or bank statement) before they can be verified.
  A donor’s payment screenshot alone is **not** evidence that money arrived.
- **Duplicates.** The same payment reference can only be recorded once. The
  portal also warns about entries with the same type, account and amount within
  three days, and asks you to confirm they are separate transactions.
- **Closed periods.** After an account is reconciled up to a date, no entry on
  or before that date can be added, edited or verified for that account.
  Corrections are recorded in the current period.
- **History.** Every change is in the audit history with who did it and when.

## Authorised payment methods

PRAYASH accepts money only through the organisation’s own accounts, shown on
the Support Us page from **Settings → Donation payment details**:

- UPI to the organisation’s UPI ID, and/or
- bank transfer to the organisation’s bank account, and
- cash or cheque handed to an authorised member, with a receipt.

There is **no payment gateway** and the website never collects card numbers,
UPI PINs, OTPs or bank passwords. Changing the published payment details
requires a confirmation step and is recorded in the audit history with the old
and new values — confirm any change in person with another office-holder.

## Setting up

1. **Accounts** (Finance → Accounts): add one record per real account — for
   example the bank account, the UPI-linked account if different, and a cash
   box. Use names everyone recognises.
2. **Opening balance:** for each account, record an *opening balance* entry
   (Record an entry → Other → Opening balance) dated the day before you start
   using the ledger, with the bank statement or cash count as evidence. Each
   account can have only one opening balance, and no other entry can be dated
   before it.

## Manual donation verification process

This is the documented process for confirming that a donation was received.

### When a donor reports a payment on the website

1. The report appears under **Finance → Awaiting verification** as a pending
   *public donation* marked **Reported by donor**, with the amount, date,
   UPI reference / UTR and an optional screenshot.
2. Open the organisation’s **bank statement or UPI app history** (not the
   donor’s screenshot) and find a credit with the **same amount, date and
   reference**.
3. If you find it: open the entry, choose **Verify**, select the account the
   money arrived in, and write how you checked it, e.g. *“Matched to SBI
   statement 12 Oct 2026, UTR 4321…”*. Attach the statement page if you can.
4. If you cannot find it: wait a few days for bank delays, contact the donor if
   they gave details, and **Reject** with a reason if it never arrived. Never
   verify on the strength of a screenshot.
5. If the donor recorded a wrong amount or date, **Edit** the pending entry
   to match the bank record before verification (this resets the four-eyes
   check: a different person must then verify).

### When money arrives without a report

Record it yourself from the bank statement (Record an entry → Contribution or
donation), attach the statement page, and ask another treasurer or
administrator to verify it.

### Cash

Count cash with a second person present, issue a receipt, record it the same
day as a contribution into the cash account, and deposit it to the bank
promptly (recorded as a **transfer** from cash to bank).

### Receipts

After verification, a donation or contribution has a receipt number in the
form `PRY/2026-27/0001`, numbered per Indian financial year. Open the entry and
choose **Receipt** to print or save it as PDF. Receipts state the amount in
figures and words and make **no tax-exemption claim**. Do not add 80G or similar
wording unless PRAYASH holds the registration and the text has been approved.

## Expenses and assistance payments

1. Record the expense with the payee, category, account, payment reference and
   bill number. If it pays for an approved request for help, enter the
   request’s reference number (PRY-XXXX-XXXX) — the ledger links to it without
   copying the applicant’s details.
2. Attach the bill or receipt.
3. Another treasurer or administrator verifies it.

## Projects

- **Restricted contributions:** if a donor asks for money to go to one project,
  choose that project when recording the donation.
- **Allocations** earmark general funds for a project without moving money.
- Each project’s position (allocated, restricted income, spent to date) is shown
  to finance roles on the project’s Budget tab; the public sees verified project
  spending only when the project is published.

## Correcting mistakes

| Situation | What to do |
| --- | --- |
| Pending entry is wrong | Edit it, or reject it with a reason |
| Verified entry is wrong | Open it → **Reverse (correct)** with a reason, then record the corrected entry (the portal links them) |
| Donor asks for a refund | Record a **refund** referencing the verified donation; it needs evidence and verification |
| Reversal was a mistake | Reject the pending reversal; once verified, record a new correct entry |

## Monthly reconciliation

1. At month end, open **Finance → Reconciliation** for each account.
2. Enter the statement date and the **closing balance printed on the bank
   statement** (or the counted cash).
3. The portal compares it with the balance calculated from verified entries
   and shows any pending entries up to that date.
4. If the difference is **zero**, the period is closed for that account.
   If not, find the cause (a missing, duplicate or unverified entry), fix it
   with new entries, and reconcile again. Never “force” a balance.

## Financial reports

1. **Finance → Reports → New report**: choose a month, financial year or custom
   period that has ended. The portal takes a **snapshot of totals** from
   verified entries: opening and closing balances, income by type, spending by
   category, and spending on published projects. Unpublished projects are
   combined, and no donor, payee or applicant is ever named.
2. Add a short narrative and, if useful, supporting PDFs. You must confirm each
   document has been **redacted** (no personal details, account numbers or
   signatures) before attaching it.
3. If entries change before publishing, use **Refresh from ledger**.
4. A **different** treasurer or administrator reviews and publishes it. The
   published figures are frozen and appear on the Transparency page.
5. If a published report is wrong, an administrator can **withdraw** it (it is
   removed from the public page but kept in the records); prepare a corrected
   report.

## Good practice

- Verify entries weekly; reconcile monthly; publish at least an annual report.
- Keep original bills and statements for the period required by law and by
   PRAYASH’s own rules.
- Turn on two-step verification for every finance account.
- Never share portal accounts, and never send screenshots of the ledger or
  donor details outside the finance team.
