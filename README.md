# Shrinkwrap

Shrinkwrap makes images, GLB 3D models, audio, video and font files smaller without uploading them. Everything runs in the browser, with drag-and-drop batches and a ZIP download. Designed for GitHub Pages. No build step, API key, uploads, analytics, or external assets: every library is bundled in `docs/vendor`.

## Run locally

From this folder, run:

```sh
npm start
```

Open http://localhost:8080. Requires Python 3; Node is only needed for npm commands and tests. Alternatively run `python3 -m http.server 8080 --directory docs` directly. Serve the app over HTTP rather than opening index.html directly because it uses module workers.

## Publish on GitHub Pages

1. Create a GitHub repository and upload this folder's **contents**, keeping `docs` intact.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your branch (usually `main`) and the **/docs** folder, then Save.
5. GitHub will display your website URL after deployment.

All paths are relative, so repository subpath hosting works. The repository includes a test workflow; no hosting account other than GitHub is needed. This project has not been pushed or published automatically.

## Features

- **Images:** PNG, JPEG, WebP, BMP and GIF input; lossless recompression or conversion to WebP, PNG and JPEG.
- **3D models:** `.glb` files get meshopt geometry compression, de-duplication, and texture downscaling / WebP re-encoding. Output uses `EXT_meshopt_compression` and `EXT_texture_webp`, so three.js, Babylon.js and model-viewer read it. Older viewers may not. Models that already use Draco keep Draco for the mesh and get smaller textures.
- **Audio:** almost any input (MP3, WAV, FLAC, AAC, M4A, OGG, Opus, AIFF, WMA…) to MP3, AAC, Opus or lossless FLAC, with bitrate and mono options, powered by ffmpeg.wasm. The ~30 MB engine loads only the first time audio is used. Opus is limited to complexity 4 because higher levels crash this wasm build on stereo input.
- **Video:** almost any input (MP4, MOV, MKV, WebM, AVI, WMV, FLV, MPEG, TS, 3GP…) to MP4, MOV, MKV, WebM or animated WebP. Lossy: H.264 or VP8 with four quality levels, optional resolution and frame-rate caps. Lossless: original streams repackaged without re-encoding (falling back to lossless H.264 when the container can't hold them), lossless H.264, or FFV1 in MKV. Uses the same ffmpeg.wasm engine as audio and runs single-threaded, so long clips take a while. H.265, VP9 and Theora are not offered because they hang or crash in this wasm build.
- **Fonts:** TTF, OTF, WOFF, WOFF2, EOT and SVG fonts in; WOFF2, WOFF, TTF/OTF, EOT or SVG out. Changing format alone is lossless (every table, ligature and kerning pair kept; OTF stays CFF). Optional subsetting to Latin, Latin extended or your own characters, and hinting removal, rebuild the font: outlines and kerning are kept, OpenType layout features such as ligatures are dropped. Uses fonteditor-core, pako and Google's woff2 (wasm), bundled in `docs/vendor/font`.
- Licences: ffmpeg-core is GPL-2.0-or-later (see `docs/vendor/ffmpeg-core/NOTICE.md`); the rest is MIT/Apache-2.0.

- Drag-and-drop batches, individual downloads, and one ZIP download.
- PNG recompression using reversible PNG row filtering and browser-native DEFLATE.
- Balanced mode tries existing filters and adaptive filters. Maximum also tries each fixed filter.
- PNG pixels, alpha, bit depth, palette, color profiles, and metadata are retained.
- A worker keeps compression off the UI thread; files are processed sequentially.
- Original-format outputs never exceed original file size. WebP conversion can be larger.
- Lossless PNG → WebP with bundled @jsquash/webp 1.5.0 / libwebp WebAssembly, no CDN. Each output is decoded and compared byte-for-byte against source RGBA pixels before download.
- WebP conversion supports non-interlaced grayscale, indexed, RGB, and RGBA PNGs up to 8 bits per channel. Metadata is not copied. Custom profile, orientation, HDR, 16-bit, animated, and interlaced inputs are rejected in conversion mode.
- Optional JPEG **COM comment removal**, without re-encoding scan data. EXIF (including GPS), orientation, and ICC profiles are retained.
- 30 MB input limit, 100 MB decoded PNG limit, 50 files per batch.

## What to expect

This is a lossless PNG tool with basic JPEG comment cleanup, **not a replacement for TinyPNG's lossy quantization or CloudConvert's format conversion**. Optimized inputs may save nothing. JPEGs without comments remain unchanged. It converts supported PNG files to lossless WebP. Conversion also accepts JPEG, WebP, BMP, and GIF input when the browser can decode them. AVIF, HEIC, TIFF, SVG, PDF, video, and document conversion are not included. Animated and interlaced PNGs are returned unchanged. Files with unusual trailing PNG data or invalid checksums are rejected.

Lossless means image information is preserved, not that output file bytes are identical. Metadata is preserved; this is not a metadata privacy scrubber. Browser-native DEFLATE will not always match the compression ratios of native optimizers such as oxipng or Zopfli.

Use a current browser supporting CompressionStream, DecompressionStream, and module workers. The app requires serving its local assets, but image processing makes no network requests. For a fully disconnected workflow, download this repository and run the local server. A hosted copy does not provide offline installation/caching.

## Verification

```sh
npm test
```

Tests compare decoded byte arrays across grayscale, indexed, RGB, alpha, packed-bit, and 16-bit PNG fixtures; check metadata preservation, size invariants, invalid files, memory limits, and JPEG segment preservation. PNG filtering follows the [W3C PNG specification](https://www.w3.org/TR/png-3/).

## Structure

- `docs/`: complete static application served by GitHub Pages.
- `docs/engine.js`: compression and input validation.
- `docs/worker.js`: background compression worker.
- `tests/`: dependency-free regression tests.

App code is MIT licensed. Bundled jSquash/libwebp files retain their Apache-2.0/BSD notices in `docs/vendor/webp/LICENSE` and `docs/vendor/webp/codec/LICENSE.codec.md`.

## Format conversion controls

Choose an output before adding files:

- **Original format**: lossless PNG recompression or optional JPEG comment cleanup.
- **PNG → WebP · lossless**: verified exact pixels from supported PNGs.
- **Convert to PNG**: browser-decoded still-image PNG export.
- **Convert to JPEG · lossy**: quality 1–100, with a chosen background for transparency.
- **Convert to WebP · lossy**: quality 1–100 with transparency support.

Conversion accepts PNG, JPEG, WebP, BMP, and GIF. GIF and detected animated PNG/WebP require the first-frame checkbox. Browser decoding support varies. Conversion exports are 8-bit browser-rendered pixels; color profiles and metadata are not copied. This mode is not byte-exact or suitable for preserving 16-bit/HDR originals. JPEG and lossy WebP alter pixels even at quality 100.

Original dimensions are preserved by default. Enable “Resize image (optional)” to set maximum width/height. Resizing fits within bounds, always preserves proportions, and never crops, stretches, or enlarges images. Conversion is limited to 25 megapixels. Changing settings automatically reprocesses all loaded original files after a short pause. Older work is cancelled and stale downloads are removed. No re-upload is needed. CloudConvert-style image controls are included, not CloudConvert's document/video formats.

Downloads preserve original filenames without numbering or suffixes. Conversion changes only the extension. If different inputs produce identical filenames, the ZIP contains duplicate names; extract those individually to avoid overwrite prompts.
