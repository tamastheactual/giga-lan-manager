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
import Aron from '../assets/players/Áron.jpg';
import MateBorsy from '../assets/players/MateBorsy.png';
import MateBado from '../assets/players/MateBado.png';
import MartinSallai from '../assets/players/MartinSallai.png';
import AaronSerebrenik from '../assets/players/AaronSerebrenik.png';
import IstvanCsibi from '../assets/players/IstvanCsibi.png';
import EszterGabor from '../assets/players/EszterGabor.png';
import CsongorErdei from '../assets/players/CsongorErdei.png';

// Map of lowercase player name -> image URL. Keyed by the exact name the player
// is entered as (accents included). Most are full names; Kaan is single-name.
const playerImageMap: Record<string, string> = {
    'cat': Cat,
    'kaan': Kaan,
    'arpan ekka': Arpan,
    'arron pirku': Arron,
    'nagy balázs': Balazs,
    'janik bálint': Balint,
    'fegyó benedek': Benedek,
    'hubay csenge': Csenge,
    'molnár imre': Imi,
    'makó kristóf': Kristof,
    'szász milán': Milan,
    'domonkos márk': Mark,
    'gyöngyössy natabara': Natabara,
    'fecht szilárd': Szilard,
    'takács tamás': Tamas,
    'thausif rehman': Thausif,
    'varga viktor': Viktor,
    'barta zoltán': Zoli,
    'csibi zsolt': Zsolt,
    'fóthi áron': Aron,
    'máté borsy': MateBorsy,
    'máté badó': MateBado,
    'martin sallai': MartinSallai,
    'aaron serebrenik': AaronSerebrenik,
    'istván csibi': IstvanCsibi,
    'eszter gábor': EszterGabor,
    'csongor erdei': CsongorErdei,
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
