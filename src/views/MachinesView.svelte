<script lang="ts">
  import MainSection from '../lib/components/MainSection.svelte';
  import Sidebar from '../lib/components/Sidebar.svelte';
  import type { SidebarSection } from '../lib/components/types';
  import { connection, isConnected } from '../lib/grbl/stores';
  import AdvancedSection from '../lib/machines/components/AdvancedSection.svelte';
  import CalibrationSection from '../lib/machines/components/CalibrationSection.svelte';
  import ConnectionSection from '../lib/machines/components/ConnectionSection.svelte';
  import ConnectionSummary from '../lib/machines/components/ConnectionSummary.svelte';
  import ConsoleSection from '../lib/machines/components/ConsoleSection.svelte';
  import ManualControlSection from '../lib/machines/components/ManualControlSection.svelte';
  import OverviewSection from '../lib/machines/components/OverviewSection.svelte';
  import PenSection from '../lib/machines/components/PenSection.svelte';
  import ProfileSelector from '../lib/machines/components/ProfileSelector.svelte';
  import WorkspaceSection from '../lib/machines/components/WorkspaceSection.svelte';
  import { activeProfile } from '../lib/machines/stores/profiles';
  import { machinesSection } from '../lib/stores/navigation';

  /**
   * Machines tab.
   *
   * Only the routing and the section frame live here; each section is its own
   * component so the connection, motion, and configuration concerns stay
   * separable.
   */
  const sections: SidebarSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'connection', label: 'Connection' },
    { id: 'manual-control', label: 'Manual Control' },
    { id: 'pen', label: 'Pen' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'calibration', label: 'Calibration', hint: 'Read-only' },
    { id: 'console', label: 'Console' },
    { id: 'advanced', label: 'Advanced' },
  ];

  const SECTION_META: Record<string, { title: string; description: string }> = {
    overview: {
      title: 'Machine overview',
      description: 'Profile, firmware, and live state for the selected machine.',
    },
    connection: {
      title: 'Connection',
      description:
        'Choose a serial port and open a connection to the GRBL controller.',
    },
    'manual-control': {
      title: 'Manual control',
      description:
        'Jog the machine, set work zero, and control motion. Start with small distances.',
    },
    pen: {
      title: 'Pen',
      description:
        'Configure and test the pen up and pen down commands for this machine.',
    },
    workspace: {
      title: 'Workspace',
      description: 'Drawing area, origin, and axis directions used by the application.',
    },
    calibration: {
      title: 'Calibration',
      description: 'Read the controller settings that govern physical motion.',
    },
    console: {
      title: 'Console',
      description: 'Everything sent to and received from the controller.',
    },
    advanced: {
      title: 'Advanced',
      description: 'Connection timing, firmware details, and profile transfer.',
    },
  };

  const current = $derived($machinesSection);
  const meta = $derived(SECTION_META[current] ?? SECTION_META.overview);
</script>

<Sidebar
  title="Machines"
  {sections}
  active={current}
  onSelect={(id) => machinesSection.set(id)}
>
  {#snippet top()}
    <ProfileSelector />
  {/snippet}

  {#snippet bottom()}
    <ConnectionSummary />
  {/snippet}
</Sidebar>

<MainSection title={meta?.title ?? 'Machines'} description={meta?.description}>
  {#snippet actions()}
    {#if $connection.kind === 'demo' && $isConnected}
      <span class="badge badge--accent">Demo connection</span>
    {/if}
    <span class="badge badge--soft">{$activeProfile.name}</span>
  {/snippet}

  {#if current === 'overview'}
    <OverviewSection />
  {:else if current === 'connection'}
    <ConnectionSection />
  {:else if current === 'manual-control'}
    <ManualControlSection />
  {:else if current === 'pen'}
    <PenSection />
  {:else if current === 'workspace'}
    <WorkspaceSection />
  {:else if current === 'calibration'}
    <CalibrationSection />
  {:else if current === 'console'}
    <ConsoleSection />
  {:else}
    <AdvancedSection />
  {/if}
</MainSection>
