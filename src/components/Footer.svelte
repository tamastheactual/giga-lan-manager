<script lang="ts">
  // Derived rather than written in: the year was hardcoded and had already gone
  // stale by one, which is a bug that comes back every January otherwise.
  const year = new Date().getFullYear();
</script>

<footer class="mt-auto pt-4 pb-4 flex justify-center">
  <div class="px-4 py-2 text-[11px] font-semibold text-gray-400 bg-space-800/60 border border-space-700 rounded-full shadow-inner">
    Created by PhD students at ELTE AI Department © {year}
  </div>
</footer>
