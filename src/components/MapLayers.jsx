import { IconLayer, PathLayer } from 'deck.gl';
import mapIcon from '../gold-pointer.png';

const iconUrl = mapIcon;
const BOUNDARY_COLOR = [255, 255, 255, 100];

export const MapLayers = ({ selectedId, onPinClick, nationalParksData, CENTER_POINT, MAX_RADIUS }) => {
  const generateBoundaryCircle = () => {
    return Array.from({ length: 360 }, (_, i) => {
      const angle = (i * Math.PI) / 180;
      return [
        CENTER_POINT.longitude + (MAX_RADIUS * Math.cos(angle) / Math.cos(CENTER_POINT.latitude * Math.PI / 180)),
        CENTER_POINT.latitude + MAX_RADIUS * Math.sin(angle)
      ];
    });
  };

  const layers = [
    new PathLayer({
      id: 'boundary-circle',
      data: [{
        path: generateBoundaryCircle(),
        color: BOUNDARY_COLOR
      }],
      getPath: d => d.path,
      getColor: d => d.color,
      getWidth: 2,
      widthMinPixels: 1,
      pickable: false
    }),

    new IconLayer({
      id: 'nationalParksIcons-' + selectedId,
      data: nationalParksData,
      pickable: true,
      getPosition: d => {
        const coords = d.geometry.coordinates;
        return Array.isArray(coords[0]) ? coords[0] : coords;
      },
      getIcon: () => ({
        url: iconUrl,
        width: 143,
        height: 143,
        anchorY: 143
      }),
      sizeScale: 9,
      getSize: d => (d.id === selectedId ? 20 : 10),
      getColor: [255, 140, 0],
      onClick: onPinClick,
      onDrag: () => {
        // Handle drag events if needed
      }
    })
  ].filter(Boolean);

  return layers;
};
