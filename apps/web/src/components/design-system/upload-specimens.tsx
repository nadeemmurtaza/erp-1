'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dropzone } from '@/components/ui/dropzone';
import { UploadTray } from '@/components/ui/upload-tray';
import { useUploadQueue, type UploadContext } from '@/hooks/use-upload-queue';
import type { UploadRules } from '@/lib/upload';
import { activeCount } from '@/lib/upload-queue';
import { Group } from './foundations';

/** The demo's own limits: real rules, small enough that a wrong file is easy to find (a PDF, a photo over 5 MB). */
const RULES: UploadRules = {
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  maxBytes: 5 * 1024 * 1024,
  maxFiles: 10,
};

/** One simulated link: 60 000 bytes every 100 ms, 600 KB/s, so a 2 MB file takes about four seconds and Cancel can be reached. */
const STEP_MS = 100;
const STEP_BYTES = 60_000;

/** The five sample files: the third fails on its first attempt. Sizes are small real allocations, made on click. */
const SAMPLES = [
  { name: 'front-view.jpg', bytes: 1_200_000 },
  { name: 'back-view.jpg', bytes: 2_400_000 },
  { name: 'close-up-print.jpg', bytes: 2_000_000 },
  { name: 'detail-hem.jpg', bytes: 1_800_000 },
  { name: 'label.jpg', bytes: 1_500_000 },
] as const;

const FAILS_FIRST = 'close-up-print.jpg';

/**
 * Pretends to send `file`: reports progress on a timer, honours Cancel, and can
 * fail halfway or report no total. There is no API behind it; everything the
 * tray shows here is the real queue, tray and zone with a timer where the
 * network would be.
 */
function simulate(file: File, { signal, onProgress }: UploadContext, how: 'ok' | 'fail-halfway' | 'unmeasured') {
  return new Promise<{ name: string }>((resolve, reject) => {
    let sent = 0;
    const timer = window.setInterval(() => {
      sent = Math.min(file.size, sent + STEP_BYTES);
      onProgress(sent, how === 'unmeasured' ? 0 : file.size);
      if (how === 'fail-halfway' && sent >= file.size / 2) {
        window.clearInterval(timer);
        reject(new Error('The connection dropped halfway. Retry to send it again.'));
      } else if (sent >= file.size) {
        window.clearInterval(timer);
        resolve({ name: file.name });
      }
    }, STEP_MS);
    signal.addEventListener(
      'abort',
      () => {
        window.clearInterval(timer);
        reject(new DOMException('Canceled', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * The upload controls, live and API-free: a zone with real rules (drop a PDF, or
 * a photo over 5 MB, and the refusal is on screen with nothing sent), a button
 * that sends five files of which the third fails halfway ("4 of 5 · 1 failed",
 * the other four finishing, Retry on the third alone), and the tray laid out
 * inline instead of docked. Every lane has its own Cancel.
 */
export function UploadSpecimens() {
  const queue = useUploadQueue();
  const failedOnce = useRef(new Set<string>());

  const sendFive = () => {
    const files = SAMPLES.map(({ name, bytes }) => new File([new ArrayBuffer(bytes)], name, { type: 'image/jpeg' }));
    queue.enqueue(files, {
      rules: RULES,
      send: (file, context) => {
        // Only the first attempt fails, so Retry has something to show.
        const fails = file.name === FAILS_FIRST && !failedOnce.current.has(file.name);
        if (fails) failedOnce.current.add(file.name);
        return simulate(file, context, fails ? 'fail-halfway' : 'ok');
      },
    });
  };

  const sendUnmeasured = () => {
    queue.enqueue([new File([new ArrayBuffer(1_500_000)], 'no-total.jpg', { type: 'image/jpeg' })], {
      rules: RULES,
      send: (file, context) => simulate(file, context, 'unmeasured'),
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Group
        title="One target, limits upfront"
        note="Drop a file anywhere on the card, press Enter on it, or paste an image into it. The limits are printed before anyone gets one wrong; a file the rules refuse is named, never sent."
      >
        <div className="grid gap-4">
          <Dropzone
            multiple
            rules={RULES}
            queued={activeCount(queue.items)}
            onFiles={(files) =>
              queue.enqueue(files, { rules: RULES, send: (file, context) => simulate(file, context, 'ok') })
            }
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={sendFive}>
              Send five (one fails)
            </Button>
            <Button variant="secondary" onClick={sendUnmeasured}>
              Send one with no progress
            </Button>
          </div>
        </div>
      </Group>

      <Group
        title="Every file its own lane"
        note="Each lane has its percent, size, speed and Cancel; time left appears after a second. A failed lane keeps its reason and a Retry, and the others carry on."
      >
        {queue.items.length > 0 ? (
          <UploadTray
            docked={false}
            items={queue.items}
            onCancel={queue.cancel}
            onRetry={queue.retry}
            onDismiss={queue.clearSettled}
          />
        ) : (
          <p className="text-sm text-neutral-900/60">Nothing is uploading. Send five files to see the tray.</p>
        )}
      </Group>
    </div>
  );
}
