<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    /** Secondary line for the physical consequences of the action. */
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'caution';
    /** Machine-motion safety callout. Off for non-motion confirms (e.g. delete). */
    showSafety?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    detail,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
    showSafety = true,
    onConfirm,
    onCancel,
  }: Props = $props();

  /**
   * Confirmation for actions that cause physical motion.
   *
   * A native dialog gives focus trapping, Escape handling, and the correct
   * accessibility semantics without a library. The cancel button holds initial
   * focus so an accidental Enter never starts a movement.
   */
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
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
  onclose={() => {
    if (open) onCancel();
  }}
>
  <h2 class="dialog__title">{title}</h2>
  <p class="dialog__message">{message}</p>
  {#if detail}
    <p class="dialog__detail">{detail}</p>
  {/if}

  {#if showSafety}
    <div class="callout callout--warn dialog__safety">
      <span class="callout__arrow" aria-hidden="true">→</span>
      <span>
        Software controls are not a replacement for a physical emergency stop.
        Stay ready to cut power to the machine.
      </span>
    </div>
  {/if}

  <div class="dialog__actions">
    <button type="button" class="btn" onclick={onCancel}>{cancelLabel}</button>
    <button
      type="button"
      class="btn {tone === 'caution' ? 'btn--accent' : 'btn--primary'}"
      onclick={onConfirm}
    >
      {confirmLabel}
    </button>
  </div>
</dialog>

<style>
  .dialog {
    border: var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    max-width: 460px;
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
    margin-bottom: var(--space-2);
  }

  .dialog__detail {
    font-size: 13px;
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
  }

  .dialog__safety {
    margin-bottom: var(--space-4);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
