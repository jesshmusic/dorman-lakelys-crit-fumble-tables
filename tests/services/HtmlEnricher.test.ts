/**
 * HtmlEnricher Service Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { resetMocks, mockEnrichHTML } from '../mocks/foundry';

/** The PHB surge text as stored: `&Reference` is entity-encoded exactly once. */
const PLANT = 'While you’re a plant, you have the &amp;Reference[Incapacitated] condition.';

describe('HtmlEnricher', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should pass the stored HTML to enrichHTML as-is, without escaping it again', async () => {
    const enrichHTML = mockEnrichHTML();
    const { HtmlEnricher } = await import('../../src/services/HtmlEnricher');

    const html = await HtmlEnricher.enrich(PLANT);

    expect(enrichHTML).toHaveBeenCalledWith(PLANT, expect.any(Object));
    expect(html).toContain('<a class="content-link">Incapacitated</a>');
    expect(html).not.toContain('&amp;Reference');
    expect(html).not.toContain('&amp;amp;');
  });

  it('should strip secrets, since the card is public', async () => {
    const enrichHTML = mockEnrichHTML();
    const { HtmlEnricher } = await import('../../src/services/HtmlEnricher');

    await HtmlEnricher.enrich('<p>text</p>');

    expect(enrichHTML).toHaveBeenCalledWith(
      '<p>text</p>',
      expect.objectContaining({ secrets: false })
    );
  });

  it('should forward relativeTo and rollData', async () => {
    const enrichHTML = mockEnrichHTML();
    const { HtmlEnricher } = await import('../../src/services/HtmlEnricher');
    const relativeTo = { uuid: 'RollTable.abc.TableResult.def' };
    const rollData = { prof: 3 };

    await HtmlEnricher.enrich('<p>text</p>', { relativeTo, rollData });

    expect(enrichHTML).toHaveBeenCalledWith(
      '<p>text</p>',
      expect.objectContaining({ relativeTo, rollData })
    );
  });

  it('should return an empty string for empty input without enriching', async () => {
    const enrichHTML = mockEnrichHTML();
    const { HtmlEnricher } = await import('../../src/services/HtmlEnricher');

    expect(await HtmlEnricher.enrich('')).toBe('');
    expect(await HtmlEnricher.enrich(undefined)).toBe('');
    expect(await HtmlEnricher.enrich(null)).toBe('');
    expect(enrichHTML).not.toHaveBeenCalled();
  });

  it('should return the raw HTML when the TextEditor API is unavailable', async () => {
    const { HtmlEnricher } = await import('../../src/services/HtmlEnricher');

    expect(await HtmlEnricher.enrich(PLANT)).toBe(PLANT);
  });

  it('should return the raw HTML and warn when enrichment throws', async () => {
    mockEnrichHTML(async () => {
      throw new Error('enricher exploded');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { HtmlEnricher } = await import('../../src/services/HtmlEnricher');

    expect(await HtmlEnricher.enrich(PLANT)).toBe(PLANT);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not enrich'),
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
