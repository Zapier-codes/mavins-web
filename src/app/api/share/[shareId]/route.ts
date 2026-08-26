// src/app/share/[shareId]/route.ts (updated with batch)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClickBatcher } from '@/lib/utils/clickBatcher';

// Force dynamic rendering — this route needs runtime env vars. Without this,
// Next.js tries to statically collect page data at build time, evaluating
// the module before env vars are available.
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { shareId: string } }
) {
  const shareId = params.shareId;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Share Redirect] Missing Supabase env vars');
    return NextResponse.redirect(new URL('/', request.url));
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Fetch share data from Supabase
    const { data: shareData, error } = await supabase
      .from('shares')
      .select('*')
      .eq('share_id', shareId)
      .single();

    if (error || !shareData) {
      console.error('[Share Redirect] Share not found:', error);
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Add click to batch (doesn't hit database immediately)
    const batcher = getClickBatcher();
    batcher.addClick(shareId);

    const userAgent = request.headers.get('user-agent') || '';
    const isMobile = /android|iphone|ipad|ipod|android/i.test(userAgent);

    // Build deep link for the app
    const appDeepLink = `soundwave://play?track_id=${shareData.track_id}&user_id=${shareData.user_id}&title=${encodeURIComponent(shareData.title)}&artist=${encodeURIComponent(shareData.artist)}`;

    // If on mobile, serve the invisible landing page
    if (isMobile) {
      return new NextResponse(
        generateInvisibleLandingPageHTML({
          title: shareData.title,
          artist: shareData.artist,
          thumbnail: shareData.thumbnail || '',
          trackId: shareData.track_id,
          userId: shareData.user_id,
          appDeepLink,
          shareId,
        }),
        {
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    // Desktop: redirect to web player
    return NextResponse.redirect(
      new URL(`/player/${shareData.track_id}`, request.url)
    );
  } catch (error) {
    console.error('[Share Redirect] Error:', error);
    return NextResponse.redirect(new URL('/', request.url));
  }
}

function generateInvisibleLandingPageHTML(data: {
  title: string;
  artist: string;
  thumbnail: string;
  trackId: string;
  userId: string;
  appDeepLink: string;
  shareId: string;
}): string {
  const { title, artist, thumbnail, trackId, userId, appDeepLink, shareId } = data;

  // Get download URLs from environment variables
  const androidDownloadUrl = process.env.ANDROID_DOWNLOAD_URL || '';
  const iosDownloadUrl = process.env.IOS_DOWNLOAD_URL || '';
  const githubReleasesUrl = process.env.GITHUB_RELEASES_URL || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

  <!-- Open Graph Tags for Rich Previews -->
  <meta property="og:title" content="Listen to ${escapeHtml(title)} 🎵" />
  <meta property="og:description" content="${escapeHtml(artist)} · Mavin Player" />
  <meta property="og:image" content="${escapeHtml(thumbnail)}" />
  <meta property="og:url" content="https://mavins.vercel.app/share/${shareId}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:site_name" content="Mavin Player" />

  <!-- Twitter Card Tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Listen to ${escapeHtml(title)} 🎵" />
  <meta name="twitter:description" content="${escapeHtml(artist)} · Mavin Player" />
  <meta name="twitter:image" content="${escapeHtml(thumbnail)}" />

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      "name": "${escapeHtml(title)}",
      "byArtist": {
        "@type": "MusicGroup",
        "name": "${escapeHtml(artist)}"
      },
      "url": "https://mavins.vercel.app/share/${shareId}",
      "image": "${escapeHtml(thumbnail)}"
    }
  </script>

  <title>Listen to ${escapeHtml(title)} 🎵</title>

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background: #0a0a0f;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    body.visible {
      opacity: 1;
    }
    .container {
      max-width: 400px;
      width: 100%;
      text-align: center;
      display: none;
    }
    body.visible .container {
      display: block;
    }
    .artwork {
      width: 120px;
      height: 120px;
      border-radius: 16px;
      margin: 0 auto 20px;
      background: #1a1a1a;
      background-image: url('${escapeHtml(thumbnail)}');
      background-size: cover;
      background-position: center;
    }
    .artwork.fallback {
      background: linear-gradient(135deg, #FF6B35, #FF3D00);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .artist {
      font-size: 16px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 32px;
    }
    .download-btn {
      display: inline-block;
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #FF6B35, #FF3D00);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      margin-bottom: 12px;
      box-shadow: 0 4px 16px rgba(255, 61, 0, 0.3);
      transition: transform 0.15s ease;
    }
    .download-btn:active {
      transform: scale(0.97);
    }
    .github-link {
      display: inline-block;
      padding: 12px;
      color: rgba(255,255,255,0.5);
      text-decoration: none;
      font-size: 14px;
    }
    .github-link:hover {
      color: rgba(255,255,255,0.7);
    }
    .badge {
      margin-top: 16px;
      font-size: 12px;
      color: rgba(255,255,255,0.2);
    }
  </style>
</head>
<body>
  <div class="container" id="fallbackUI">
    <div class="artwork" id="artwork" style="background-image: url('${escapeHtml(thumbnail)}');"></div>
    <h1>${escapeHtml(title)}</h1>
    <p class="artist">${escapeHtml(artist)}</p>
    <a href="#" class="download-btn" id="downloadBtn">Download Mavin Player</a>
    <a href="${githubReleasesUrl}" class="github-link" target="_blank">View on GitHub Releases</a>
    <div class="badge">⚡ Shared via Mavin</div>
  </div>

  <script>
    const deepLink = '${appDeepLink}';
    const androidUrl = '${androidDownloadUrl}';
    const iosUrl = '${iosDownloadUrl}';
    const githubUrl = '${githubReleasesUrl}';
    const shareId = '${shareId}';

    // Detect platform
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    // Send tracking ping (will be batched server-side)
    fetch('/api/share/track/' + shareId, { method: 'POST' }).catch(() => {});

    // Try to open the app
    const startTime = Date.now();
    let appOpened = false;

    // Method 1: Try opening deep link directly
    window.location.href = deepLink;

    // Method 2: Also try using an iframe as fallback for some browsers
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = deepLink;
      document.body.appendChild(iframe);
    } catch (e) {
      // Silent fail
    }

    // Determine download URL based on platform
    let downloadUrl = githubUrl;
    if (isAndroid && androidUrl) {
      downloadUrl = androidUrl;
    } else if (isIOS && iosUrl) {
      downloadUrl = iosUrl;
    }

    // Set the download button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.href = downloadUrl;
    }

    // Check if app opened successfully
    setTimeout(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 3000 && !document.hidden) {
        // App didn't open, show fallback UI and redirect to download
        document.body.classList.add('visible');
        
        // Auto-redirect to download after 2 seconds
        setTimeout(() => {
          window.location.href = downloadUrl;
        }, 2000);
      }
    }, 2500);

    // If page becomes hidden, app opened successfully
    document.addEventListener('visibilitychange', function onVisibilityChange() {
      if (document.hidden) {
        appOpened = true;
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    });

    // Also listen for page blur
    window.addEventListener('blur', function onBlur() {
      appOpened = true;
      window.removeEventListener('blur', onBlur);
    });

    // If no thumbnail, show fallback icon
    const artwork = document.getElementById('artwork');
    if (!artwork.style.backgroundImage || artwork.style.backgroundImage === 'url("")') {
      artwork.classList.add('fallback');
      artwork.textContent = '🎵';
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}