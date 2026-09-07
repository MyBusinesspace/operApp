import React, { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";

// Fix leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const RING = {
  in: "#3b82f6",     // blue — clock in
  out: "#ef4444",    // red — clock out
  track: "#22c55e",  // green — on going (last track)
};

function makeIcon(initial, color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:${color};">${initial}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32],
  });
}

// Spread pins that share (nearly) the same coordinates side by side along the lng axis
// so clock-in / clock-out / on-going markers at one location don't overlap.
const OFFSET = 0.006; // ~600m lateral step — keeps co-located pins clearly separated at common zoom levels
function spreadOverlapping(pins) {
  const groups = {};
  const key = (p) => `${p.lat.toFixed(4)}_${p.lng.toFixed(4)}`;
  pins.forEach(p => {
    const k = key(p);
    (groups[k] = groups[k] || []).push(p);
  });
  Object.values(groups).forEach(group => {
    if (group.length <= 1) return;
    const start = -(group.length - 1) / 2;
    group.forEach((p, i) => { p.lng = p.lng + (start + i) * OFFSET; });
  });
  return pins;
}

// Build a list of pins from today's entries: clock-in (green), clock-out (red), last-track (orange)
function buildPins(entries, lastTrackingMap) {
  const pins = [];
  entries.forEach(entry => {
    const initial = entry.employee_name?.[0]?.toUpperCase() || "?";
    // Clock-in pin
    if (entry.clock_in_lat && entry.clock_in_lng) {
      pins.push({
        id: `${entry.id}-in`,
        lat: entry.clock_in_lat,
        lng: entry.clock_in_lng,
        color: RING.in,
        kind: "Clock In",
        time: entry.clock_in_time,
        initial,
        entry,
      });
    }
    // Clock-out pin
    if (entry.clock_out_time && entry.clock_out_lat && entry.clock_out_lng) {
      pins.push({
        id: `${entry.id}-out`,
        lat: entry.clock_out_lat,
        lng: entry.clock_out_lng,
        color: RING.out,
        kind: "Clock Out",
        time: entry.clock_out_time,
        initial,
        entry,
      });
    }
    // On Going pin (orange) — active entries: last live-track position, or clock-in location as fallback
    if (!entry.clock_out_time) {
      const track = lastTrackingMap[entry.id];
      if (track && track.lat && track.lng) {
        pins.push({
          id: `${entry.id}-ongoing`,
          lat: track.lat,
          lng: track.lng,
          color: RING.track,
          kind: "On Going",
          time: track.recorded_at,
          initial,
          entry,
        });
      } else if (entry.clock_in_lat && entry.clock_in_lng) {
        pins.push({
          id: `${entry.id}-ongoing`,
          lat: entry.clock_in_lat,
          lng: entry.clock_in_lng,
          color: RING.track,
          kind: "On Going",
          time: entry.clock_in_time,
          initial,
          entry,
        });
      }
    }
  });
  return spreadOverlapping(pins);
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    const apply = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [40, 40], animate: false });
    };
    const t = setTimeout(apply, 100);
    return () => clearTimeout(t);
  }, [map, points]);
  return null;
}

function PinPopup({ pin }) {
  const e = pin.entry || {};
  return (
    <div className="text-xs space-y-1 min-w-[150px]">
      <p className="font-semibold">
        {e.employee_name}
        <span className="ml-2 font-normal" style={{ color: pin.color }}>{pin.kind}</span>
        {pin.time && <span className="font-normal text-gray-500 ml-2">{format(new Date(pin.time), "h:mm a")}</span>}
      </p>
      {e.contact_name && <p className="text-gray-500">Customer: {e.contact_name}</p>}
      {e.project_name && <p className="text-gray-500">Project: {e.project_name}</p>}
      {e.work_order_name && <p className="text-gray-500">WO: {e.work_order_name}</p>}
      <p>{e.task_title}</p>
    </div>
  );
}

const KIND_BY_FILTER = { in: "Clock In", out: "Clock Out", track: "On Going" };

export default function WorkerMap({ activeEntries, lastTrackingMap = {}, pinFilter = "all" }) {
  const allPins = useMemo(
    () => buildPins(activeEntries, lastTrackingMap),
    [activeEntries, lastTrackingMap]
  );

  const pins = useMemo(
    () => pinFilter === "all" ? allPins : allPins.filter(p => p.kind === KIND_BY_FILTER[pinFilter]),
    [allPins, pinFilter]
  );

  if (pins.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        {pinFilter !== "all" ? `No ${KIND_BY_FILTER[pinFilter].toLowerCase()} pins available` : "No GPS data available for active workers"}
      </div>
    );
  }

  const center = [
    pins.reduce((s, p) => s + p.lat, 0) / pins.length,
    pins.reduce((s, p) => s + p.lng, 0) / pins.length,
  ];

  return (
    <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%", borderRadius: "inherit" }}
      scrollWheelZoom={false}>
      <FitBounds points={pins} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {pins.map(pin => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={makeIcon(pin.initial, pin.color)}
        >
          <Popup>
            <PinPopup pin={pin} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}