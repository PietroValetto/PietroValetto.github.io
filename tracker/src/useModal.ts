import { RefObject, useCallback, useEffect, useRef } from "react";

/**
 * Open a <dialog> as a modal on mount and route every way of closing it (close button, backdrop
 * click, Escape) through one guarded handler, so React state never drifts from the DOM.
 * Escape is caught on the synchronous "cancel" event; the native "close" event is only a backstop,
 * because some embedded browsers never dispatch it.
 */
export function useModal(ref: RefObject<HTMLDialogElement>, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  const done = useRef(false);

  const close = useCallback(() => {
    if (done.current) return;
    done.current = true;
    if (ref.current?.open) ref.current.close();
    latest.current();
  }, [ref]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    done.current = false;
    const onCancel = (ev: Event) => { ev.preventDefault(); close(); };
    dlg.addEventListener("cancel", onCancel);
    dlg.addEventListener("close", close);
    if (!dlg.open) dlg.showModal();
    return () => {
      dlg.removeEventListener("cancel", onCancel);
      dlg.removeEventListener("close", close);
    };
  }, [ref, close]);

  const onBackdrop = (ev: React.MouseEvent) => { if (ev.target === ref.current) close(); };
  return { close, onBackdrop };
}
