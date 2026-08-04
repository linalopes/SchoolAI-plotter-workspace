<script lang="ts">
  interface Props {
    open: boolean;
    name: string;
    onConfirm: (name: string) => void;
    onCancel: () => void;
  }

  let { open, name, onConfirm, onCancel }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  let draft = $state('');

  $effect(() => {
    if (open) draft = name;
  });

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      queueMicrotask(() => {
        inputEl?.focus();
        inputEl?.select();
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function submit() {
    onConfirm(draft);
  }
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
  onclose={() => {
    if (open) onCancel();
  }}
>
  <h2 class="dialog__title">Rename document</h2>
  <label class="field__label" for="rename-document-input">Display name</label>
  <input
    id="rename-document-input"
    bind:this={inputEl}
    class="dialog__input"
    type="text"
    maxlength="120"
    bind:value={draft}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    }}
  />
  <p class="dialog__detail">
    Renaming changes the name shown in Prepare only. Original SVG filenames and
    p5 sketch links are preserved.
  </p>
  <div class="dialog__actions">
    <button type="button" class="btn" onclick={onCancel}>Cancel</button>
    <button type="button" class="btn btn--primary" onclick={submit}>Rename</button>
  </div>
</dialog>

<style>
  .dialog {
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    max-width: 420px;
    width: calc(100vw - var(--space-6));
    background: var(--color-white);
    color: var(--color-text);
    font-family: var(--font-body);
  }

  .dialog::backdrop {
    background: rgba(34, 17, 62, 0.5);
  }

  .dialog__title {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: var(--space-2);
  }

  .dialog__input {
    width: 100%;
    margin: var(--space-1) 0 var(--space-2);
    font: inherit;
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-2);
    background: var(--color-white);
  }

  .dialog__detail {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
