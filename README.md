# Dynamic Audio MVP v0.2

Chrome extension MVP that reduces loud music and sound effects by compressing
the dynamic range of the current tab.

## Main change from v0.1

The previous version used makeup gain after compression:

```js
makeupGainNode.gain.value = 1.25;
```

That increased the perceived level of dialogue too.

Version 0.2 removes makeup gain completely and uses stronger compression:

```js
compressorNode.threshold.value = -28;
compressorNode.knee.value = 12;
compressorNode.ratio.value = 8;
compressorNode.attack.value = 0.01;
compressorNode.release.value = 0.30;
```

The processing chain is now:

```text
Tab audio
   |
   v
Compressor
   |
   v
Peak control
   |
   v
Speakers
```

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.
5. Open a tab with audio.
6. Click the extension icon.
7. The badge shows `ON` while processing is enabled.
8. Click again to disable it.

## Development

After editing a file, open:

```text
chrome://extensions
```

and click the reload button on the extension.

## Important limitation

This version does not identify music, dialogue, or effects independently.

It reduces audio according to signal level. Loud dialogue can therefore also be
compressed, while quiet music may remain largely unchanged.
