import React from 'react';
import {AdminDrawer, ADMIN_BUTTON} from './ui';

/** A native nested dialog stays above the member record in the browser top layer. */
export default function MemberConfirmation({open, onOpenChange, title, description, warning = '', cancelLabel = 'Keep unchanged', confirmLabel = 'Confirm', onConfirm, busy = false}) {
  return <AdminDrawer open={open} role="alertdialog" title={title} description={description} onOpenChange={value => !busy && onOpenChange(value)} closeLabel="Close confirmation" closeDisabled={busy}
    footer={<div className="members-actions"><button type="button" className="admin-kit-button" disabled={busy} onClick={() => onOpenChange(false)}>{cancelLabel}</button><button type="button" className={`admin-kit-button ${ADMIN_BUTTON.primary}`} disabled={busy} onClick={onConfirm}>{busy ? 'Updating…' : confirmLabel}</button></div>}>
    {warning && <p className="members-warning">{warning}</p>}
  </AdminDrawer>;
}
