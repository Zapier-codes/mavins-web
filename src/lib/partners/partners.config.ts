// src/lib/partners/partners.config.ts
/**
 * Partner roster for the "As seen with" / supporting-partners marquee.
 *
 * Uses real assets from both public/images/platforms/ (companies) and
 * public/images/artists/ (people). The list is interleaved so one platform
 * and one artist alternate — no clustering, natural variety across the strip.
 */

export interface PartnerSlot {
  id: string;
  name: string;
  logo: string;
  href?: string;
}

/** Interleaved partner + artist assets — platform, artist, platform, artist... */
export const PARTNER_SLOTS: PartnerSlot[] = [
  { id: 'spotify', name: 'Spotify', logo: '/images/platforms/Spotify.png' },
  { id: 'blord', name: 'Blord', logo: '/images/artists/Blord.jpg' },
  { id: 'apple', name: 'Apple Music', logo: '/images/platforms/Apple.png' },
  { id: 'bossblingzs', name: 'Boss Blingzs', logo: '/images/artists/Bossblingzs.jpg' },
  { id: 'soundcloud', name: 'SoundCloud', logo: '/images/platforms/Soundcloud.png' },
  { id: 'chino-dollaz', name: 'Chino Dollaz', logo: '/images/artists/Chino_Dollaz.jpeg' },
  { id: 'bandlab', name: 'BandLab', logo: '/images/platforms/bandlab.png' },
  { id: 'cito-boi', name: 'Cito Boi', logo: '/images/artists/Cito_Boi.jpg' },
  { id: 'tunecore', name: 'TuneCore', logo: '/images/platforms/tunecore.png' },
  { id: 'don-jazzy', name: 'Don Jazzy', logo: '/images/artists/Don_Jazzy.jpeg' },
  { id: 'umg', name: 'UMG', logo: '/images/platforms/UMG.jpeg' },
  { id: 'dr-dre', name: 'Dr. Dre', logo: '/images/artists/Dr.Dre.jpg' },
  { id: 'nme', name: 'NME', logo: '/images/platforms/NME.png' },
  { id: 'earn', name: 'Earn', logo: '/images/artists/Earn.jpeg' },
  { id: 'playlist-push', name: 'Playlist Push', logo: '/images/platforms/PlaylistPush.png' },
  { id: 'famous-pluto', name: 'Famous Pluto', logo: '/images/artists/Famous_Pluto.jpg' },
  { id: 'mj', name: 'MJ', logo: '/images/platforms/MJ.png' },
  { id: 'golden-bank', name: 'Golden Bank', logo: '/images/artists/Golden_Bank.jpeg' },
  { id: 'olamide', name: 'Olamide', logo: '/images/platforms/Olamide.jpg' },
  { id: 'katt-williams', name: 'Katt Williams', logo: '/images/artists/Katt_Williams.jpeg' },
  { id: 'olivia-dean', name: 'Olivia Dean', logo: '/images/artists/Olivia_Dean.jpeg' },
  { id: 'pharrell', name: 'Pharrell Williams', logo: '/images/artists/Pharrell_Williams.jpg' },
  { id: 'snow-tha-product', name: 'Snow Tha Product', logo: '/images/artists/Snow_Tha_Product.jpeg' },
  { id: 'tom-macdonald', name: 'Tom MacDonald', logo: '/images/artists/Tom_Macdonalds.jpeg' },
  { id: 'lil-nas', name: 'Lil Nas X', logo: '/images/artists/lil-nas.jpg' },
];
