// Shared state for the admin pages.
import { $, setHTML } from '../lib/ui.js';

export const ctx = {
  me: null, ref: null, role: null,
  view: null,
  show(content, heading) {
    setHTML(ctx.view, content);
    if (heading) document.title = `${heading} | Recovery Day admin`;
    ctx.view.focus({ preventScroll: true });
  },
  can(...roles) { return roles.includes(ctx.role); },
};
export const ADMIN = ['admin', 'super_admin'];
export const FINANCE = ['admin', 'finance', 'super_admin'];
export const SUPER = ['super_admin'];
export function init() { ctx.view = $('#view'); }
