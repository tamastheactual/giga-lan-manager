<script lang="ts">
  let { show = $bindable(false), duration = 3000 } = $props<{ 
    show?: boolean; 
    duration?: number;
  }>();

  // Auto-hide after duration
  $effect(() => {
    if (show) {
      const timer = setTimeout(() => {
        show = false;
      }, duration);
      return () => clearTimeout(timer);
    }
  });

  // Increase confetti count to 150 pieces
  const confettiCount = 150;
  
  // More vibrant colors
  const colors = [
    '#06B6D4', // cyan
    '#22C55E', // green
    '#FBCF24', // yellow
    '#EC4899', // pink
    '#A855F7', // purple
    '#F97316', // orange
    '#EF4444', // red
    '#3B82F6', // blue
    '#10B981', // emerald
    '#F59E0B', // amber
  ];
</script>

{#if show}
  <div class="confetti-container">
    {#each Array(confettiCount) as _, i}
      <div 
        class="confetti" 
        style="
          --rotation: {Math.random() * 360}deg;
          --x-start: {Math.random() * 100}vw;
          --x-end: {(Math.random() - 0.5) * 300}px;
          --delay: {Math.random() * 1}s;
          --duration: {2.5 + Math.random() * 2.5}s;
          --color: {colors[i % colors.length]};
          --size: {6 + Math.random() * 8}px;
        "
      ></div>
    {/each}
  </div>
{/if}

<style>
  .confetti-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  }

  .confetti {
    position: absolute;
    width: var(--size);
    height: var(--size);
    background-color: var(--color);
    top: -20px;
    left: var(--x-start);
    opacity: 1;
    animation: confetti-fall var(--duration) linear var(--delay) forwards,
               confetti-glow 1s ease-in-out infinite;
    transform: rotate(var(--rotation));
  }

  .confetti::before {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: inherit;
    transform: rotate(45deg);
  }

  @keyframes confetti-fall {
    0% {
      transform: translateY(0) translateX(0) rotate(var(--rotation)) scale(1);
      opacity: 1;
    }
    50% {
      opacity: 1;
    }
    100% {
      transform: translateY(110vh) translateX(var(--x-end)) rotate(calc(var(--rotation) + 1080deg)) scale(0.5);
      opacity: 0;
    }
  }

  @keyframes confetti-glow {
    0%, 100% {
      filter: drop-shadow(0 0 3px currentColor) drop-shadow(0 0 6px currentColor) brightness(1.2);
    }
    50% {
      filter: drop-shadow(0 0 6px currentColor) drop-shadow(0 0 12px currentColor) brightness(1.5);
    }
  }
</style>