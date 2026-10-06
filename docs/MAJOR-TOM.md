# Notes for Major Tom (Last Door payment page)

Recovery Day Alberta does **not** take card payments itself. Vendors and
sponsors pay on Last Door's own page, <https://lastdoor.org/pay-for-invoice/>.
We need two small things from the Major Tom team so payments are matched to
invoices automatically. Please send them this page.

> Status: **SPEC DEFAULT – CONFIRM.** The parameter names and webhook format
> below are our proposal. If Major Tom prefers different names, we only change
> one setting (`pay_link`) and, if needed, a few lines in
> `supabase/functions/payment-notify/index.ts`.

---

## 1. A pre-filled pay link

Every invoice email and the vendor portal show a **Pay now** button that opens:

```
https://lastdoor.org/pay-for-invoice/?purpose=sponsor&reference=2027CD001&amount=100.00&org=Holina%20Global&name=Pat%20Lee&email=pat%40example.com
```

| Parameter | Example | Meaning |
|---|---|---|
| `purpose` | `sponsor` | Pre-selects "Sponsorship / Recovery Day" on the form |
| `reference` | `2027CD001` | Our invoice number — please put it in the payment's reference/memo field and pass it back in the webhook |
| `amount` | `100.00` | Amount due now in CAD (deposit, or the balance). The payer may change it |
| `org` | `Holina Global` | Organization name |
| `name` | `Pat Lee` | Contact name |
| `email` | `pat@example.com` | Contact email (for the receipt) |

All values are URL-encoded. If the form can't be pre-filled, the button still
works and the page tells the payer to choose **Sponsorship** and type the
invoice number as the reference.

**Where to change it:** admin site → **Settings & users** → *Rules and text* →
`pay_link` → `template`. Placeholders: `{invoice} {amount} {org} {name} {email} {phone}`.

## 2. A webhook after each successful Recovery Day payment

Please `POST` to:

```
https://<our-project>.supabase.co/functions/v1/payment-notify
```

**Body** (JSON, UTF-8):

```json
{
  "reference":    "2027CD001",
  "amount":       "100.00",
  "payer_name":   "Pat Lee",
  "payer_email":  "pat@example.com",
  "organization": "Holina Global",
  "paid_at":      "2027-06-02T15:04:05Z",
  "payment_id":   "pi_3PqXYZ..."
}
```

- `payment_id` must be unique per payment (the Stripe PaymentIntent id is
  perfect). We ignore repeats, so retrying is safe.
- `amount` is CAD, dollars with a decimal point.
- Only send payments made for Recovery Day (purpose = sponsor / reference
  starting with an invoice number), if possible.

**Header** — a signature so nobody else can fake a payment:

```
X-RDA-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
```

where `v1 = hex( HMAC_SHA256( PAYMENT_WEBHOOK_SECRET, t + "." + raw_body ) )`.

- `PAYMENT_WEBHOOK_SECRET` is a shared secret. Chad will send it to Major Tom
  through a password manager share — **never by email or chat**.
- We reject signatures older than **5 minutes**, so the server clock must be
  correct.

Example in PHP (WordPress):

```php
$body = wp_json_encode($payload);
$t    = time();
$sig  = hash_hmac('sha256', $t . '.' . $body, RDA_WEBHOOK_SECRET);
wp_remote_post($url, [
  'headers' => ['Content-Type' => 'application/json', 'X-RDA-Signature' => "t=$t,v1=$sig"],
  'body'    => $body,
  'timeout' => 15,
]);
```

**Responses:** `200` with `{"status":"matched"|"unmatched"|"duplicate"}`.
`401` = bad or old signature. Please retry on `5xx` or timeouts (up to 3 times).

## What happens on our side

1. We read the invoice number from `reference` (we accept `2027CD001`,
   `#2027-CD-001`, `CD001`, `invoice 2027cd001`…).
2. If the invoice exists, is sent, and the amount isn't more than what's owing,
   the payment is recorded, a numbered receipt (R-2027-0001…) is created and
   emailed, and it appears in the admin **Payments → Auto-matched** list for a
   quick human check.
3. Anything else (no number, wrong amount, unknown invoice) goes to the
   **Unmatched** queue and a staff member assigns it by hand. Nothing is lost.

## If a webhook isn't possible

Two fallbacks, both already built:

- **Email:** Major Tom's site sends its normal payment confirmation email to
  `payments@recoverydayalberta.com`; an inbound-email service forwards it to our
  `inbound-payment-email` function, which reads the invoice number and amount.
- **Import:** finance downloads a CSV/Excel payment report from the payment
  page and uploads it in **Payments → Import payments** (preview first, then
  apply).
