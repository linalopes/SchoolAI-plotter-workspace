<script lang="ts">
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  aria-labelledby="local-storage-title"
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
  onclose={() => {
    if (open) onClose();
  }}
>
  <h2 id="local-storage-title" class="dialog__title">Saved locally</h2>
  <p class="dialog__message">
    Your sketches are automatically stored in this browser.
  </p>
  <p class="dialog__detail">
    They are not synchronized to the cloud and may be lost if browser data is
    cleared or you use another browser or computer.
  </p>
  <p class="dialog__detail">
    Download individual sketches or download all sketches as a ZIP to keep
    portable copies on your computer.
  </p>
  <div class="dialog__actions">
    <button type="button" class="btn btn--primary" onclick={onClose}>Got it</button>
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

  .dialog__message {
    margin: 0 0 var(--space-2);
  }

  .dialog__detail {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
</style>
