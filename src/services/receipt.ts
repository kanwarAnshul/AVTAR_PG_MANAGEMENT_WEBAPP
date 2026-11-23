import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildReceiptHtml, type ReceiptData } from './receiptHtml';

export { buildReceiptHtml };
export type { ReceiptData };

/**
 * Professional rent receipt PDF generation — native implementation.
 *
 * Used after a tenant submits a rent payment and from the owner / warden
 * ledgers. The receipt is generated from live database rows only — no
 * template or sample data is stored in the app. The web build resolves
 * receipt.web.ts instead, which opens the browser print dialog.
 */

/** Generates the PDF, saves a copy in the app's documents, and opens the share sheet. */
export const generateAndShareReceipt = async (data: ReceiptData): Promise<string> => {
  const html = buildReceiptHtml(data);
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });

  const safeNo = String(data.payment?.receipt_no || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const dir = `${FileSystem.documentDirectory}receipts`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const saved = `${dir}/${safeNo}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: saved });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(saved, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Rent receipt ${safeNo}`,
      });
    }
    return saved;
  } catch {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    }
    return uri;
  }
};
