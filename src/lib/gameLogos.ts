// Dynamic game logo imports using Vite's glob import
// This automatically imports all game logos from src/assets/games/

const gameImages = import.meta.glob('../assets/games/*.png', { eager: true, import: 'default' }) as Record<string, string>;

// Create a mapping from filename to imported URL
const logoMap: Record<string, string> = {};
for (const path in gameImages) {
  // Extract filename without extension: '../assets/games/CounterStrike.png' -> 'CounterStrike'
  const filename = path.split('/').pop()?.replace('.png', '') || '';
  logoMap[filename.toLowerCase()] = gameImages[path];
}

// Debug: log all available logos
console.log('Available game logos:', Object.keys(logoMap));

// Get a game logo by filename (case-insensitive)
export function getGameLogoUrl(filename: string): string {
  // Remove '/games/' prefix and '.png' suffix if present
  const cleanName = filename
    .replace(/^\/games\//, '')
    .replace(/\.png$/, '')
    .toLowerCase();
  
  const result = logoMap[cleanName] || '';
  if (!result) {
    console.warn(`Logo not found for: "${filename}" -> cleaned: "${cleanName}"`);
  }
  return result;
}

// Export the full map for debugging
export { logoMap };
