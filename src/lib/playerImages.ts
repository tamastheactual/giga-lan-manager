// Import all player images from assets/players folder
// Vite will handle these imports and provide proper URLs

// Import all images using Vite's glob import
const playerImageModules = import.meta.glob('../assets/players/*.(jpg|jpeg|png)', { eager: true, import: 'default' });

// Build a map of lowercase name -> image URL
const playerImageMap: Record<string, string> = {};

for (const [path, url] of Object.entries(playerImageModules)) {
    // Extract filename without extension from path like '../assets/players/Arpan.jpg'
    const filename = path.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png)$/i, '');
    // Store with lowercase key for case-insensitive matching
    playerImageMap[nameWithoutExt.toLowerCase()] = url as string;
}

// Default image (Cat.jpg)
const defaultImage = playerImageMap['cat'] || '';

/**
 * Get the profile photo URL for a player name.
 * Returns the matching image if found, otherwise returns Cat.jpg
 */
export function getPlayerImageUrl(playerName: string): string {
    const normalizedName = playerName.trim().toLowerCase();
    return playerImageMap[normalizedName] || defaultImage;
}

/**
 * Check if a player has a custom image (not the default Cat)
 */
export function hasCustomImage(playerName: string): boolean {
    const normalizedName = playerName.trim().toLowerCase();
    return normalizedName !== 'cat' && normalizedName in playerImageMap;
}

/**
 * Get all available player names that have images
 */
export function getAvailablePlayerNames(): string[] {
    return Object.keys(playerImageMap).filter(name => name !== 'cat');
}
