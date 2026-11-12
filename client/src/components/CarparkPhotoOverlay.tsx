import { Button, FileButton, Group, Select, Switch, Text } from '@mantine/core';
import { IconPhotoUp, IconPinnedOff, IconRestore } from '@tabler/icons-react';
import { memo, useMemo, useState, type MouseEvent } from 'react';
import { run, STATUS_META, visualOf } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { HERO_BAY } from '../types';

const SAMPLE = '/carpark-sample.svg';
const KEY = 'smartpark.photo';

const loadPhoto = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Downscale to keep the photo small enough to remember in this browser. It never leaves the device. */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export const CarparkPhotoOverlay = memo(function CarparkPhotoOverlay() {
  const bays = useParkingStore((s) => s.bays);
  const selectBay = useParkingStore((s) => s.selectBay);
  const post = useParkingStore((s) => s.post);
  const [photo, setPhoto] = useState<string | null>(loadPhoto);
  const [placing, setPlacing] = useState(false);
  const [target, setTarget] = useState<string>(HERO_BAY);

  const ids = useMemo(() => Object.keys(bays).sort(), [bays]);
  const pins = useMemo(() => Object.values(bays).filter((b) => b.photoCoords), [bays]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    await run(async () => {
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG or PNG).');
      const url = await toDataUrl(file);
      try {
        localStorage.setItem(KEY, url);
      } catch {
        /* too large to remember; still shown for this visit */
      }
      setPhoto(url);
      setPlacing(true);
    }, 'Photo loaded. It stays in this browser only. Now click the photo to place bay pins.');
  };

  const useSample = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setPhoto(null);
  };

  const onImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    void run(() => post(`/api/parking/bays/${target}/photo-coords`, { xPct, yPct }), `Pin for ${target} saved.`);
  };

  return (
    <div>
      <Group gap="sm" mb="sm" align="flex-end">
        <FileButton onChange={onUpload} accept="image/png,image/jpeg,image/webp">
          {(props) => (
            <Button {...props} variant="light" leftSection={<IconPhotoUp size={16} />}>
              Upload carpark photo
            </Button>
          )}
        </FileButton>
        {photo && (
          <Button variant="subtle" color="gray" leftSection={<IconRestore size={16} />} onClick={useSample}>
            Use sample image
          </Button>
        )}
        <Select label="Bay to pin" data={ids} value={target} onChange={(v) => v && setTarget(v)} searchable allowDeselect={false} w={130} />
        <Switch label="Placement mode" checked={placing} onChange={(e) => setPlacing(e.currentTarget.checked)} mb={8} />
        {bays[target]?.photoCoords && (
          <Button variant="subtle" color="red" leftSection={<IconPinnedOff size={16} />} onClick={() => void run(() => post(`/api/parking/bays/${target}/photo-coords`, { clear: true }), `Pin for ${target} removed.`)}>
            Remove pin
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="xs">
        {placing ? `Click anywhere on the image to place the pin for ${target}.` : 'Click a pin to inspect that bay. Turn on placement mode to add or move pins.'}
        {!photo && ' Showing an illustrated sample, not a real carpark.'}
      </Text>
      <div className="sp-photo" data-placing={placing || undefined} onClick={onImageClick}>
        <img src={photo ?? SAMPLE} alt={photo ? 'Uploaded carpark photo' : 'Illustrated sample of a basement carpark row'} draggable={false} />
        {pins.map((b) => {
          const v = visualOf(b);
          return (
            <button
              key={b.id}
              type="button"
              className="sp-pin"
              data-visual={v}
              style={{ left: `${b.photoCoords!.xPct}%`, top: `${b.photoCoords!.yPct}%` }}
              onClick={(e) => {
                if (placing) return;
                e.stopPropagation();
                selectBay(b.id);
              }}
              aria-label={`Bay ${b.id}, ${STATUS_META[v].label}`}
            >
              <span className="sp-pin__dot" />
              <span className="sp-pin__label">
                {b.id}
                <small>{STATUS_META[v].short}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
