
import { SheetConfig } from '../types';

/**
 * Parses the Google Sheets ID from a standard URL.
 */
export const getSheetId = (url: string): string | null => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

/**
 * Fetches sheet data as CSV and parses URLs.
 * Assumes the sheet is shared as "Anyone with link can view".
 */
export const fetchUrlsFromSheet = async (config: SheetConfig): Promise<string[]> => {
  const sheetId = getSheetId(config.url);
  if (!sheetId) throw new Error('Invalid Google Sheets URL');

  // Using the Visualization API to fetch CSV data for public/shared sheets
  const queryUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.sheetName)}`;
  
  try {
    const response = await fetch(queryUrl);
    if (!response.ok) throw new Error('Failed to fetch sheet data. Ensure the sheet is shared correctly.');
    
    const csvData = await response.text();
    const rows = csvData.split('\n').map(row => row.split(','));
    
    // Extracting URLs (basic logic: search for strings starting with http)
    const urls: string[] = [];
    rows.forEach(row => {
      row.forEach(cell => {
        const cleaned = cell.replace(/^"(.*)"$/, '$1').trim();
        if (cleaned.startsWith('http')) {
          urls.push(cleaned);
        }
      });
    });

    return urls;
  } catch (error) {
    console.error('Sheet fetch error:', error);
    throw error;
  }
};
