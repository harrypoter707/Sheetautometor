
import { AutomationSettings } from "../types";

export class AutomationEngine {
  /**
   * Submits a batch of URLs to the Google Apps Script Webhook
   */
  async submitBatch(urls: string[], settings: AutomationSettings): Promise<{ success: boolean; message: string }> {
    if (!settings.webhookUrl) {
      return { success: false, message: "No Webhook URL provided." };
    }

    try {
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script requires no-cors or simple redirects
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: urls,
          sheetName: settings.sheetName,
          timestamp: new Date().toISOString()
        })
      });

      // Since 'no-cors' doesn't return response details, we assume success if no error is thrown
      return { success: true, message: `Batch of ${urls.length} sent.` };
    } catch (e: any) {
      return { success: false, message: e.message || "Network Error" };
    }
  }
}
