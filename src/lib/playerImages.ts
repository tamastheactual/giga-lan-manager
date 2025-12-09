// Import all player images from assets/players folder
// Using explicit imports to ensure proper path resolution in both dev and prod

// Import images explicitly - Vite will handle them correctly
import Arpan from '../assets/players/Arpan.jpg';
import Arron from '../assets/players/Arron.jpg';
import Balazs from '../assets/players/Balázs.jpg';
import Benedek from '../assets/players/Benedek.jpg';
import Balint from '../assets/players/Bálint.jpg';
import Cat from '../assets/players/Cat.jpg';
import Csenge from '../assets/players/Csenge.jpg';
import Gabor from '../assets/players/Gábor.jpg';
import Hunor from '../assets/players/Hunor.jpg';
import Imi from '../assets/players/Imi.jpg';
import Kaan from '../assets/players/Kaan.jpg';
import Kristof from '../assets/players/Kristóf.jpg';
import Milan from '../assets/players/Milán.jpg';
import Mark from '../assets/players/Márk.jpg';
import Natabara from '../assets/players/Natabara.jpg';
import Szilard from '../assets/players/Szilárd.jpg';
import Tamas from '../assets/players/Tamás.jpg';
import Thausif from '../assets/players/Thausif.jpg';
import Viktor from '../assets/players/Viktor.png';
import Zoli from '../assets/players/Zoli.jpg';
import Zsolt from '../assets/players/Zsolt.png';
import Adam from '../assets/players/Ádám.jpg';
import Aron from '../assets/players/Áron.jpg';

// Build a map of lowercase name -> image URL
const playerImageMap: Record<string, string> = {
    'arpan': Arpan,
    'arron': Arron,
    'balázs': Balazs,
    'benedek': Benedek,
    'bálint': Balint,
    'cat': Cat,
    'csenge': Csenge,
    'gábor': Gabor,
    'hunor': Hunor,
    'imi': Imi,
    'kaan': Kaan,
    'kristóf': Kristof,
    'milán': Milan,
    'márk': Mark,
    'natabara': Natabara,
    'szilárd': Szilard,
    'tamás': Tamas,
    'thausif': Thausif,
    'viktor': Viktor,
    'zoli': Zoli,
    'zsolt': Zsolt,
    'ádám': Adam,
    'áron': Aron,
};

// Default image (Cat.jpg)
const defaultImage = Cat;

/**
 * Get the profile photo URL for a player name.
 * Returns the matching image if found, otherwise returns Cat.jpg
 */
export function getPlayerImageUrl(playerName: string): string {
    const normalizedName = playerName.trim().toLowerCase();
    const result = playerImageMap[normalizedName] || defaultImage;
    return result;
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
