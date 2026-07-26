// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  cancelLabel = 'Keep unchanged',
  confirmLabel = 'Confirm',
  onConfirm,
  busy = false,
}) {
  // `disabled={busy}` only helps after React re-renders. A double-click on
  // Confirm can still invoke onConfirm twice in the same paint cycle.
  const confirmLockRef = useRef(false);

  useEffect(() => {
    if (!open || !busy) confirmLockRef.current = false;
  }, [open, busy]);

  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !busy && onOpenChange(nextOpen)}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-none border-xert-steel/30 bg-xert-ink text-xert-offwhite shadow-2xl">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="font-display text-2xl font-normal uppercase tracking-normal text-xert-offwhite">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body text-sm leading-relaxed text-xert-pale/70">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {warning && (
          <p className="border-l-2 border-xert-red bg-xert-red/10 px-3 py-2 font-body text-sm leading-relaxed text-xert-pale">
            {warning}
          </p>
        )}
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel
            disabled={busy}
            className="mt-0 min-h-11 rounded-none border-xert-steel/40 bg-transparent font-display text-sm uppercase text-xert-pale hover:bg-xert-charcoal hover:text-xert-offwhite"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={event => {
              if (busy || confirmLockRef.current) {
                event.preventDefault();
                return;
              }
              confirmLockRef.current = true;
              onConfirm?.(event);
            }}
            className="min-h-11 rounded-none bg-xert-steel font-display text-sm uppercase text-xert-navy hover:bg-xert-pale"
          >
            {busy ? 'Updating...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
