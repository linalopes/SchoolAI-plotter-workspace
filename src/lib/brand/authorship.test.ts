import { describe, expect, it } from 'vitest';
import appFooter from '../components/AppFooter.svelte?raw';
import { APP_CONFIG } from '../config';
import guide from '../guide/content.ts?raw';
import readme from '../../../README.md?raw';
import packageJsonRaw from '../../../package.json?raw';

describe('Authorship and local-storage documentation', () => {
  it('keeps author metadata in central configuration', () => {
    expect(APP_CONFIG.author.name).toBe('Lina Lopes');
    expect(APP_CONFIG.author.url).toBe('https://linalopes.info/');
    expect(APP_CONFIG.organization.name).toBe("School of Tomorrow's AI");
    expect(APP_CONFIG.organization.url).toBe('https://schoolai.linalopes.info/');
  });

  it('credits Lina Lopes in the footer without repeating the product name', () => {
    expect(appFooter).toContain('Conceived and developed by');
    expect(appFooter).toContain('APP_CONFIG.author.name');
    expect(appFooter).toContain('APP_CONFIG.author.url');
    expect(appFooter).toContain('APP_CONFIG.organization.name');
    expect(appFooter).toContain('APP_CONFIG.organization.url');
    expect(appFooter).not.toContain('APP_CONFIG.productName');
    expect(appFooter).not.toContain('footer__product');
    expect(appFooter).not.toMatch(/Made by School of Tomorrow/i);
    expect(appFooter).toContain('display: flex');
    expect(appFooter).toContain('flex-wrap: wrap');
    expect(appFooter).toContain('min-height: 48px');
    expect(appFooter).toContain('padding: var(--space-3) var(--space-4)');
    expect(appFooter).toContain('align-items: center');
  });

  it('Guide contains About and credits plus ZIP-oriented local-storage guidance', () => {
    expect(guide).toContain("id: 'about'");
    expect(guide).toContain('About and credits');
    expect(guide).toContain('conceived, designed, and developed by');
    expect(guide).toContain("id: 'keeping-work'");
    expect(guide).toContain('not a permanent backup');
    expect(guide).toContain('Download all sketches');
    expect(guide).toContain('manifest.json');
    expect(guide).toContain('Export / Import workspace backup');
    expect(guide).not.toMatch(/export all sketches as JSON/i);
    expect(guide).not.toMatch(/portable JSON backup/i);
  });

  it('README authorship and local-data sections prefer ZIP over unrestorable JSON', () => {
    expect(readme).toContain('## Authorship');
    expect(readme).toContain('## Local data and backups');
    expect(readme).toContain('Conceived and developed by');
    expect(readme).toContain('not a permanent archive');
    expect(readme).toContain('recent prepared documents');
    expect(readme).toContain('Download all sketches (.zip)');
    expect(readme).toContain('manifest.json');
    expect(readme).toContain('Export workspace backup');
    expect(readme).toContain('Import workspace backup');
    expect(readme).not.toMatch(/Export all sketches…/i);
    expect(readme).not.toMatch(/LocalStorage is a permanent/i);
    expect(packageJsonRaw).toContain('"name": "Lina Lopes"');
    expect(packageJsonRaw).toContain('"url": "https://linalopes.info/"');
  });
});
