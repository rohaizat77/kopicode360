import { IconAlertTriangle, IconCar, IconLock, IconStarFilled } from '@tabler/icons-react';
import { memo, useEffect, useRef, useState } from 'react';
import { matchesFilter, STATUS_META, visualOf } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { HERO_BAY } from '../types';

interface Props {
  id: string;
  onSelectBay: (id: string) => void;
}

/**
 * One bay on the map. It subscribes to its own bay document only, so an IoT
 * event on B5-024 re-renders exactly one tile out of 70.
 */
export const BayTileCard = memo(function BayTileCard({ id, onSelectBay }: Props) {
  const bay = useParkingStore((s) => s.bays[id]);
  const dimmed = useParkingStore((s) => !matchesFilter(s.bays[id], s.mapQuery, s.mapFilter));
  // Someone with their own reserved bay is not looking for a space, so the suggestion is hidden for them.
  const nearest = useParkingStore((s) => s.activePersona !== 'owner' && s.nearestByLevel[id.startsWith('B4') ? 'B4' : 'B5'] === id);
  const [pulse, setPulse] = useState(false);
  const mounted = useRef(false);
  const status = bay?.status;
  const sensor = bay?.iotSensor.state;

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1800);
    return () => clearTimeout(t);
  }, [status, sensor]);

  if (!bay) return <div className="sp-tile sp-tile--empty" />;
  const visual = visualOf(bay);
  const meta = STATUS_META[visual];
  const occupied = bay.iotSensor.state !== 'EMPTY';
  const plate = bay.currentOccupant?.plate;

  return (
    <button
      type="button"
      className="sp-tile"
      data-visual={visual}
      data-dimmed={dimmed || undefined}
      data-pulse={pulse || undefined}
      data-nearest={nearest || undefined}
      data-hero={id === HERO_BAY || undefined}
      onClick={() => onSelectBay(id)}
      aria-label={`Bay ${id}, ${meta.label}${plate ? `, plate ${plate}` : ''}, ${bay.liftDistanceM} metres from the lift${nearest ? ', nearest free bay to the lift' : ''}`}
      title={`${id} · ${meta.label} · ${bay.liftDistanceM} m to the lift${nearest ? ' · nearest free bay to the lift' : ''}`}
    >
      <span className="sp-tile__top">
        <span className="sp-tile__num">{id.slice(3)}</span>
        <span className="sp-led" data-sensor={bay.iotSensor.state} aria-hidden />
      </span>
      <span className="sp-tile__icon" aria-hidden>
        {visual === 'UNAUTHORIZED_ALERT' ? <IconAlertTriangle size={18} /> : occupied ? <IconCar size={18} /> : visual === 'RESERVED_LOCKED' ? <IconLock size={16} /> : <span className="sp-tile__p">P</span>}
      </span>
      <span className="sp-tile__plate">{plate ?? meta.short}</span>
      {id === HERO_BAY && <IconStarFilled className="sp-tile__star" size={10} aria-hidden />}
    </button>
  );
});
