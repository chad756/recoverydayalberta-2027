// =============================================================================
// DATA LAYER — every page talks to the database through this one file.
// =============================================================================
// Normal builds use Supabase (backend-supabase.js).
// Demo builds (VITE_DEMO=true, used only for the HTML preview) use an in-memory
// copy with sample data (src/demo/demo-backend.js). Nothing in a demo is saved.
//
// api.list(table, {eq, in, order, asc, limit})   → rows (Row Level Security applies)
// api.get(table, id) · api.insert(table, row) · api.update(table, {id}, patch)
// api.remove(table, {id}) · api.rpc(name, args) · api.fn(name, body)
// api.pdf('invoice'|'receipt', id) → {blob, filename}
// api.upload(bucket, path, file) · api.signedUrl(bucket, path)
// api.auth.*  (see backend files)
// =============================================================================

export const isDemo = import.meta.env.VITE_DEMO === 'true';

const backend = isDemo
  ? await import('../demo/demo-backend.js')
  : await import('./backend-supabase.js');

export const api = backend.api;
export const isConfigured = backend.isConfigured;
