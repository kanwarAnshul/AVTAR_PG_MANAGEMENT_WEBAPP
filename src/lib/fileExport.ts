import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Native file export: write a text file to the app documents directory and
 * hand it to the platform share sheet. The web build resolves
 * fileExport.web.ts instead (no native filesystem on web).
 */
export const exportTextFile = async (
  fileName: string,
  content: string,
  mimeType = 'text/plain'
): Promise<string> => {
  const uri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: fileName.endsWith('.csv') ? '.csv' : '.txt',
      mimeType,
      dialogTitle: fileName,
    });
  }
  return uri;
};
