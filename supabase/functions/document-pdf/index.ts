// =============================================================================
// document-pdf — download an invoice or receipt PDF
// =============================================================================
// GET ?invoice=<id>  or  ?receipt=<payment id>   (Authorization: user's login)
// Access is checked with the caller's own login (Row Level Security): vendors
// only get their organization's sent invoices; staff get everything.
// =============================================================================
import { adminClient, corsHeaders, HttpError, loadSettings, serve, userClient } from '../_shared/supabase.ts';
import { invoicePdf, receiptPdf } from '../_shared/documents.ts';

serve(async (req) => {
  const url = new URL(req.url);
  const invoiceId = url.searchParams.get('invoice');
  const paymentId = url.searchParams.get('receipt');
  const user = userClient(req);
  const admin = adminClient();
  const settings = await loadSettings(admin);
  let out;
  if (invoiceId) {
    const { data } = await user.from('invoices').select('id').eq('id', invoiceId).maybeSingle();
    if (!data) throw new HttpError(404, 'Invoice not found.');
    out = await invoicePdf(admin, settings, invoiceId);
  } else if (paymentId) {
    const { data } = await user.from('payments').select('id').eq('id', paymentId).maybeSingle();
    if (!data) throw new HttpError(404, 'Receipt not found.');
    out = await receiptPdf(admin, settings, paymentId);
  } else throw new HttpError(400, 'Missing invoice or receipt.');
  return new Response(out.bytes as unknown as BodyInit, { headers: {
    ...corsHeaders(req), 'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store',
    'Access-Control-Expose-Headers': 'Content-Disposition',
  } });
});
