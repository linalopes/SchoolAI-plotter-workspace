<script lang="ts">
  import { APP_CONFIG } from '../config';
</script>

<footer class="footer" data-testid="app-footer">
  <p class="footer__credit">
    <span>Conceived and developed by</span>
    <a
      class="footer__link"
      href={APP_CONFIG.author.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="{APP_CONFIG.author.name} — opens in a new tab"
    >
      {APP_CONFIG.author.name}
    </a>
    <span class="footer__sep" aria-hidden="true">·</span>
    <a
      class="footer__link"
      href={APP_CONFIG.organization.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="{APP_CONFIG.organization.name} — opens in a new tab"
    >
      {APP_CONFIG.organization.name}
      <span class="footer__arrow" aria-hidden="true">↗</span>
    </a>
  </p>
</footer>

<style>
  .footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    min-height: 48px;
    padding: var(--space-3) var(--space-4);
    border-top: var(--border);
    background: var(--color-white);
    font-size: 12px;
    box-sizing: border-box;
    flex: none;
  }

  .footer__credit {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.65rem;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .footer__sep {
    color: var(--color-text-muted);
  }

  .footer__link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-family: var(--font-title);
    font-weight: 500;
    text-decoration: none;
    color: var(--color-text);
    padding: 0 2px;
    border-radius: var(--radius);
  }

  .footer__link:hover {
    text-decoration: underline;
  }

  .footer__arrow {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  @media (max-width: 640px) {
    .footer {
      font-size: 11px;
      padding: var(--space-3);
    }
  }
</style>
