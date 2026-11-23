import { buildReceiptHtml, type ReceiptData } from './receiptHtml';

export { buildReceiptHtml };
export type { ReceiptData };

/**
 * Web receipt implementation.
 *
 * Browsers cannot save a native PDF file from JS, so the receipt is rendered
 * into a hidden print frame and the browser print dialog is opened. The user
 * chooses "Save as PDF" (or a printer) there. This uses live database rows
 * via the same shared receipt template as the native build.
 */
export const generateAndShareReceipt = async (data: ReceiptData): Promise<string> => {
  const html = buildReceiptHtml(data);
  const safeNo = String(data.payment?.receipt_no || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '');

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    frame.remove();
    throw new Error('Unable to open the receipt print view in this browser.');
  }

  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();

  // Give the frame a moment to lay out before invoking the print dialog.
  // The timer is a fallback for browsers that do not fire load on write().
  let printed = false;
  const printOnce = () => {
    if (printed) return;
    printed = true;
    frameWindow.print();
  };
  frameWindow.addEventListener('load', printOnce, { once: true });
  window.setTimeout(printOnce, 250);
  window.setTimeout(() => frame.remove(), 60_000);

  return `receipt://${safeNo}`;
};
