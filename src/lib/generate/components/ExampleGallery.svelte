<script lang="ts">
  import { SKETCH_EXAMPLES } from '../../sketches/examples';
  import ExampleThumbnail from './ExampleThumbnail.svelte';

  interface Props {
    onUseExample: (exampleId: string) => void;
  }

  let { onUseExample }: Props = $props();

  let focusedId = $state<string | null>(SKETCH_EXAMPLES[0]?.id ?? null);

  function focusCard(id: string) {
    focusedId = id;
    queueMicrotask(() => {
      document.getElementById(`example-card-${id}`)?.focus();
    });
  }

  function onCardKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = SKETCH_EXAMPLES[index + 1] ?? SKETCH_EXAMPLES[0];
      if (next) focusCard(next.id);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev =
        SKETCH_EXAMPLES[index - 1] ?? SKETCH_EXAMPLES[SKETCH_EXAMPLES.length - 1];
      if (prev) focusCard(prev.id);
    }
  }
</script>

<section class="gallery" aria-label="Built-in examples">
  <header class="gallery__header">
    <h2>Examples</h2>
    <p class="muted">
      Built-in templates stay immutable. Use example creates one editable copy in My sketches.
    </p>
  </header>

  <ul class="examples-grid">
    {#each SKETCH_EXAMPLES as example, index (example.id)}
      <li class="examples-grid__item">
        <div
          class="example-card"
          class:example-card--focused={focusedId === example.id}
        >
          <div class="example-preview">
            <ExampleThumbnail {example} />
          </div>
          <div class="example-card__body">
            <h3 class="example-card__title" id="example-title-{example.id}">
              {example.name}
            </h3>
            <p class="example-card__description">{example.description}</p>
            <ul class="example-card__tags">
              {#each example.tags as tag (tag)}
                <li>{tag}</li>
              {/each}
            </ul>
            <div class="example-card__action">
              <button
                id="example-card-{example.id}"
                type="button"
                class="btn btn--primary btn--small"
                aria-describedby="example-title-{example.id}"
                onfocus={() => (focusedId = example.id)}
                onkeydown={(event) => onCardKeydown(event, index)}
                onclick={() => onUseExample(example.id)}
              >
                Use example
              </button>
            </div>
          </div>
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .gallery {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1 1 auto;
    min-height: 0;
  }

  .gallery__header h2 {
    margin: 0 0 var(--space-1);
  }

  .gallery__header p {
    margin: 0;
  }

  .examples-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-3);
    align-items: stretch;
  }

  .examples-grid__item {
    display: flex;
    min-height: 0;
  }

  .example-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 370px;
    width: 100%;
    border: var(--border-strong);
    border-radius: var(--radius);
    background: var(--color-white);
    overflow: hidden;
  }

  .example-card:hover,
  .example-card--focused {
    border-color: var(--color-deep-purple);
  }

  .example-preview {
    aspect-ratio: 297 / 210;
    width: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
    flex: none;
    border-bottom: var(--border);
    background: #ffffff;
  }

  .example-preview :global(.thumb) {
    aspect-ratio: auto;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
  }

  .example-preview :global(.thumb img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: var(--space-3);
  }

  .example-card__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: var(--space-3);
    gap: var(--space-2);
    min-height: 0;
  }

  .example-card__title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    min-height: 1.4em;
  }

  .example-card__description {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
    min-height: 3em;
  }

  .example-card__tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    min-height: 28px;
  }

  .example-card__tags li {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    border: var(--border);
    border-radius: 2px;
    padding: 1px 6px;
    height: fit-content;
  }

  .example-card__action {
    margin-top: auto;
  }
</style>
