import React from "react";
import { MapContainer, TileLayer, Marker, Circle, Popup } from "react-leaflet";

// Leaflet requires explicit CSS - already available via react-leaflet
// Fix default icon issue
import L from "leaflet";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41],
});
const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41],
});

export default function TimeEntryMap({ entry, task }) {
  const hasTaskLocation = task?.location_lat != null && task?.location_lng != null;
  const hasClockIn = entry.clock_in_lat != null && entry.clock_in_lng != null;
  const hasClockOut = entry.clock_out_lat != null && entry.clock_out_lng != null;

  if (!hasTaskLocation && !hasClockIn) {
    return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-xl">No location data available</div>;
  }

  const center = hasTaskLocation
    ? [task.location_lat, task.location_lng]
    : [entry.clock_in_lat, entry.clock_in_lng];

  return (
    <div className="h-64 rounded-xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {hasTaskLocation && (
          <>
            <Marker position={[task.location_lat, task.location_lng]}>
              <Popup>Task Site</Popup>
            </Marker>
            <Circle center={[task.location_lat, task.location_lng]}
              radius={task.allowed_radius_m || 200}
              pathOptions={{ color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.1 }} />
          </>
        )}
        {hasClockIn && (
          <Marker position={[entry.clock_in_lat, entry.clock_in_lng]} icon={greenIcon}>
            <Popup>Clock In{entry.clock_in_address ? `\n${entry.clock_in_address}` : ""}</Popup>
          </Marker>
        )}
        {hasClockOut && (
          <Marker position={[entry.clock_out_lat, entry.clock_out_lng]} icon={redIcon}>
            <Popup>Clock Out{entry.clock_out_address ? `\n${entry.clock_out_address}` : ""}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}