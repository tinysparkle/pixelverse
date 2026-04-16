interface ScrollSnapshot {
  bodyOverflow: string;
  bodyTouchAction: string;
  htmlOverflow: string;
  htmlTouchAction: string;
}

let lockCount = 0;
let snapshot: ScrollSnapshot | null = null;

function normalizeBodyOverflow(bodyOverflow: string, htmlOverflow: string): string {
  if (bodyOverflow === "hidden" && htmlOverflow !== "hidden") {
    return "";
  }
  return bodyOverflow;
}

function normalizeBodyTouchAction(bodyTouchAction: string, htmlTouchAction: string): string {
  if (bodyTouchAction === "none" && htmlTouchAction !== "none") {
    return "";
  }
  return bodyTouchAction;
}

export function lockViewerScroll(): () => void {
  const body = document.body;
  const html = document.documentElement;

  if (lockCount === 0) {
    const bodyOverflow = normalizeBodyOverflow(body.style.overflow, html.style.overflow);
    const bodyTouchAction = normalizeBodyTouchAction(body.style.touchAction, html.style.touchAction);

    snapshot = {
      bodyOverflow,
      bodyTouchAction,
      htmlOverflow: html.style.overflow,
      htmlTouchAction: html.style.touchAction,
    };

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    html.style.overflow = "hidden";
    html.style.touchAction = "none";
  }

  lockCount += 1;
  let unlocked = false;

  return () => {
    if (unlocked) return;
    unlocked = true;

    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !snapshot) return;

    body.style.overflow = snapshot.bodyOverflow;
    body.style.touchAction = snapshot.bodyTouchAction;
    html.style.overflow = snapshot.htmlOverflow;
    html.style.touchAction = snapshot.htmlTouchAction;
    snapshot = null;
  };
}
