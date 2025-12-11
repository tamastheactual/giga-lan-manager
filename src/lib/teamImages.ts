// Team image utilities
// Teams can have custom logos stored as base64 in the database

// Default team icon SVG as a data URL
const DEFAULT_TEAM_ICON = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="30" fill="#4A5394" stroke="#6B7FD7" stroke-width="2"/>
  <path d="M32 18c-2.5 0-4.5 2-4.5 4.5S29.5 27 32 27s4.5-2 4.5-4.5S34.5 18 32 18z" fill="#23B7D1"/>
  <path d="M24 26c-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7 2.7-1.2 2.7-2.7-1.2-2.7-2.7-2.7z" fill="#23B7D1"/>
  <path d="M40 26c-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7 2.7-1.2 2.7-2.7-1.2-2.7-2.7-2.7z" fill="#23B7D1"/>
  <path d="M32 30c-4 0-7.5 2.5-9 6 1 3 4.5 5 9 5s8-2 9-5c-1.5-3.5-5-6-9-6z" fill="#23B7D1"/>
  <path d="M20 34c-2.5 0-4.5 1.5-5.5 3.5.5 2 2.5 3.5 5.5 3.5s5-1.5 5.5-3.5c-1-2-3-3.5-5.5-3.5z" fill="#23B7D1" opacity="0.7"/>
  <path d="M44 34c-2.5 0-4.5 1.5-5.5 3.5.5 2 2.5 3.5 5.5 3.5s5-1.5 5.5-3.5c-1-2-3-3.5-5.5-3.5z" fill="#23B7D1" opacity="0.7"/>
</svg>
`);

/**
 * Get the team logo/image URL.
 * If team has a custom logo (base64), return it.
 * Otherwise return the default team icon.
 */
export function getTeamImageUrl(team: { logo?: string; name?: string } | undefined | null): string {
    if (!team) return DEFAULT_TEAM_ICON;
    if (team.logo) return team.logo;
    return DEFAULT_TEAM_ICON;
}

/**
 * Check if a team has a custom logo
 */
export function hasTeamLogo(team: { logo?: string } | undefined | null): boolean {
    return !!team?.logo;
}

/**
 * Get the default team icon
 */
export function getDefaultTeamIcon(): string {
    return DEFAULT_TEAM_ICON;
}

/**
 * Convert a File to base64 string for storage
 */
export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Validate image file
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (!validTypes.includes(file.type)) {
        return { valid: false, error: 'Invalid file type. Please use JPEG, PNG, GIF, WebP, or SVG.' };
    }

    if (file.size > maxSize) {
        return { valid: false, error: 'File too large. Maximum size is 2MB.' };
    }

    return { valid: true };
}
