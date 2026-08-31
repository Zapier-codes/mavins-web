// src/lib/assets/manifest.ts
/**
 * Asset manifest for mavins-web.
 *
 * All images below are DRAFT assets — not real people or final branding.
 * They are placeholders pending the real creative solution. This manifest
 * makes swapping them trivial: update the file paths here when real assets
 * arrive; no component code needs to change.
 *
 * Source: public/images/ (organized by category)
 */

export interface ArtistAsset {
  id: string;
  src: string;
  name: string;
}

export interface PlatformAsset {
  id: string;
  src: string;
  name: string;
}

export interface UiAsset {
  id: string;
  src: string;
  name: string;
}

// ── Artist photos (draft) ──────────────────────────────────────────
export const ARTIST_IMAGES: ArtistAsset[] = [
  { id: 'blord', src: '/images/artists/Blord.jpg', name: 'Blord' },
  { id: 'bossblingzs', src: '/images/artists/Bossblingzs.jpg', name: 'Boss Blingzs' },
  { id: 'chino-dollaz', src: '/images/artists/Chino_Dollaz.jpeg', name: 'Chino Dollaz' },
  { id: 'cito-boi', src: '/images/artists/Cito_Boi.jpg', name: 'Cito Boi' },
  { id: 'don-jazzy', src: '/images/artists/Don_Jazzy.jpeg', name: 'Don Jazzy' },
  { id: 'dr-dre', src: '/images/artists/Dr.Dre.jpg', name: 'Dr. Dre' },
  { id: 'earn', src: '/images/artists/Earn.jpeg', name: 'Earn' },
  { id: 'famous-pluto', src: '/images/artists/Famous_Pluto.jpg', name: 'Famous Pluto' },
  { id: 'golden-bank', src: '/images/artists/Golden_Bank.jpeg', name: 'Golden Bank' },
  { id: 'katt-williams', src: '/images/artists/Katt_Williams.jpeg', name: 'Katt Williams' },
  { id: 'lil-nas', src: '/images/artists/lil-nas.jpg', name: 'Lil Nas X' },
  { id: 'olivia-dean', src: '/images/artists/Olivia_Dean.jpeg', name: 'Olivia Dean' },
  { id: 'pharrell', src: '/images/artists/Pharrell_Williams.jpg', name: 'Pharrell Williams' },
  { id: 'snow-tha-product', src: '/images/artists/Snow_Tha_Product.jpeg', name: 'Snow Tha Product' },
  { id: 'tom-macdonald', src: '/images/artists/Tom_Macdonalds.jpeg', name: 'Tom MacDonald' },
];

// ── Platform / brand logos (draft) ─────────────────────────────────
export const PLATFORM_LOGOS: PlatformAsset[] = [
  { id: 'apple', src: '/images/platforms/Apple.png', name: 'Apple Music' },
  { id: 'bandlab', src: '/images/platforms/bandlab.png', name: 'BandLab' },
  { id: 'mj', src: '/images/platforms/MJ.png', name: 'MJ' },
  { id: 'nme', src: '/images/platforms/NME.png', name: 'NME' },
  { id: 'olamide', src: '/images/platforms/Olamide.jpg', name: 'Olamide' },
  { id: 'playlist-push', src: '/images/platforms/PlaylistPush.png', name: 'Playlist Push' },
  { id: 'soundcloud', src: '/images/platforms/Soundcloud.png', name: 'SoundCloud' },
  { id: 'spotify', src: '/images/platforms/Spotify.png', name: 'Spotify' },
  { id: 'tunecore', src: '/images/platforms/tunecore.png', name: 'TuneCore' },
  { id: 'umg', src: '/images/platforms/UMG.jpeg', name: 'UMG' },
];

// ── UI assets (draft) ──────────────────────────────────────────────
export const UI_ASSETS: UiAsset[] = [
  { id: 'connect', src: '/images/ui/connect.jpeg', name: 'Connect' },
];

// ── Helper: get random artist subset ───────────────────────────────
export function getRandomArtists(count: number): ArtistAsset[] {
  const shuffled = [...ARTIST_IMAGES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ── Helper: get artist by id ───────────────────────────────────────
export function getArtistById(id: string): ArtistAsset | undefined {
  return ARTIST_IMAGES.find((a) => a.id === id);
}

// ── Helper: get platform by id ─────────────────────────────────────
export function getPlatformById(id: string): PlatformAsset | undefined {
  return PLATFORM_LOGOS.find((p) => p.id === id);
}
