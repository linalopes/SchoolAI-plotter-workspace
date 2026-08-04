<script lang="ts">
  import MainSection from '../lib/components/MainSection.svelte';
  import Sidebar from '../lib/components/Sidebar.svelte';
  import type { SidebarSection } from '../lib/components/types';
  import { APP_CONFIG } from '../lib/config';
  import { GUIDE_CHAPTERS } from '../lib/guide/content';
  import { guideSection } from '../lib/stores/navigation';

  /** Renders the guide content model. All copy lives in `lib/guide/content.ts`. */

  const sections: SidebarSection[] = GUIDE_CHAPTERS.map((chapter) => ({
    id: chapter.id,
    label: chapter.label,
  }));

  const chapter = $derived(
    GUIDE_CHAPTERS.find((entry) => entry.id === $guideSection) ?? GUIDE_CHAPTERS[0],
  );
</script>

<Sidebar
  title="Guide"
  {sections}
  active={$guideSection}
  onSelect={(id) => guideSection.set(id)}
>
  {#snippet bottom()}
    <p class="section-label">Milestone</p>
    <p class="milestone mono">{APP_CONFIG.milestone}</p>
  {/snippet}
</Sidebar>

{#if chapter}
  <MainSection title={chapter.title} description={chapter.intro}>
    <article class="guide">
      {#each chapter.blocks as block, index (index)}
        {#if block.type === 'paragraph'}
          <p>{block.text}</p>
        {:else if block.type === 'heading'}
          <h3 class="guide__heading">{block.text}</h3>
        {:else if block.type === 'steps'}
          <ol class="guide__steps">
            {#each block.items as item, step (step)}
              <li>{item}</li>
            {/each}
          </ol>
        {:else if block.type === 'list'}
          <ul class="guide__list">
            {#each block.items as item, entry (entry)}
              <li>{item}</li>
            {/each}
          </ul>
        {:else if block.type === 'callout'}
          <div class="callout {block.tone === 'warn' ? 'callout--warn' : ''}">
            <span class="callout__arrow" aria-hidden="true">→</span>
            <span>{block.text}</span>
          </div>
        {:else if block.type === 'faq'}
          <dl class="faq">
            {#each block.items as item (item.question)}
              <div class="faq__item">
                <dt class="faq__question">{item.question}</dt>
                <dd class="faq__answer">{item.answer}</dd>
              </div>
            {/each}
          </dl>
        {:else if block.type === 'link'}
          <p>
            <a
              href={block.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="{block.text} — opens in a new tab"
            >
              {block.text} <span aria-hidden="true">↗</span>
            </a>
          </p>
        {/if}
      {/each}
    </article>
  </MainSection>
{/if}

<style>
  .guide {
    max-width: 74ch;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .guide__heading {
    margin-top: var(--space-3);
  }

  .guide__steps,
  .guide__list {
    margin: 0;
    padding-left: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .guide__steps li::marker {
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .faq {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .faq__item {
    border-left: 2px solid var(--color-line-strong);
    padding-left: var(--space-3);
  }

  .faq__question {
    font-family: var(--font-title);
    font-weight: 500;
    font-size: 15px;
  }

  .faq__answer {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
  }

  .milestone {
    margin: var(--space-1) 0 0;
    font-size: 12px;
  }
</style>
