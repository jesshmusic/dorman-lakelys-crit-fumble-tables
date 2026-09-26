/**
 * HTML Enricher Service
 *
 * Runs table-result text through Foundry's TextEditor before it is embedded in
 * one of the module's chat cards, so enricher syntax in the text (dnd5e's
 * `&Reference[...]`, `[[/save ...]]`, `@UUID[...]` links, inline rolls) becomes
 * live links instead of reaching the card as raw markup.
 *
 * Table result descriptions are already HTML: the PHB wild magic table stores
 * `&Reference[Incapacitated]` as `&amp;Reference[Incapacitated]`, which is the
 * correct entity encoding. Pass the text through as-is; escaping it again would
 * turn `&amp;` into a literal "&amp;" on the card and hide the enricher.
 */

import { LOG_PREFIX } from '../constants';

export interface EnrichOptions {
  /** Document that relative `@UUID[.id]` links resolve against. */
  relativeTo?: unknown;
  /** Data for inline rolls such as `[[/r 1d6 + @prof]]`. */
  rollData?: Record<string, unknown>;
}

export class HtmlEnricher {
  /**
   * Enrich an HTML string for a chat card.
   *
   * Secret blocks are stripped because the card is visible to every player.
   * If the TextEditor API is missing or enrichment throws, the original HTML is
   * returned so the card still posts.
   */
  static async enrich(
    content: string | null | undefined,
    options: EnrichOptions = {}
  ): Promise<string> {
    const html = content ?? '';
    if (!html) {
      return '';
    }

    const editor = (foundry as any).applications?.ux?.TextEditor?.implementation;
    if (typeof editor?.enrichHTML !== 'function') {
      return html;
    }

    try {
      return await editor.enrichHTML(html, { ...options, secrets: false });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not enrich chat card text; posting it as-is:`, error);
      return html;
    }
  }
}
