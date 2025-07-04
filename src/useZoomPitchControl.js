// src/useZoomPitchControl.js

import { useEffect, useCallback, useRef } from 'react';

/**
 * A custom hook to control camera zoom and pitch based on wheel and touch events.
 * It integrates with an existing animation loop by updating target refs.
 *
 * @param {object} params - The hook's parameters.
 * @param {React.MutableRefObject} params.targetPositionRef - Ref for the target position (lat, lng, zoom).
 * @param {React.MutableRefObject} params.targetViewRef - Ref for the target view (pitch, bearing).
 * @param {boolean} params.enabled - A flag to enable or disable the hook's functionality.
 * @param {object} params.config - Configuration for the zoom/pitch behavior.
 */
const useZoomPitchControl = ({
  targetPositionRef,
  targetViewRef,
  enabled = true,
  config: userConfig = {},
}) => {
  // Merge user config with defaults
  const config = {
    zoomSensitivity: 0.2,
    touchZoomSensitivity: 0.005, // Sensitivity for pinch-to-zoom
    minZoom: 13.5,
    maxZoom: 16.0,
    minPitch: 0,
    maxPitch: 60,
    ...userConfig,
  };
  
  // Ref to store the previous distance between two fingers for pinch-zoom calculation
  const pinchPrevDistRef = useRef(null);

  // Helper function to interpolate pitch based on the current zoom level.
  const calculateTargetPitch = useCallback((zoom) => {
    const { minZoom, maxZoom, minPitch, maxPitch } = config;

    if (zoom <= minZoom) return minPitch;
    if (zoom >= maxZoom) return maxPitch;

    const progress = (zoom - minZoom) / (maxZoom - minZoom);
    return minPitch + progress * (maxPitch - minPitch);
  }, [config]);

  // A generic function to apply a zoom delta, clamp it, and update the refs.
  // This can be used by both wheel and touch handlers.
  const applyZoomDelta = useCallback((zoomDelta) => {
    const currentZoom = targetPositionRef.current.zoom;
    
    // Calculate the new zoom level
    let newZoom = currentZoom + zoomDelta;

    // Clamp the zoom to the desired min/max range
    newZoom = Math.max(config.minZoom, Math.min(config.maxZoom, newZoom));

    // Calculate the corresponding pitch for the new zoom level
    const newPitch = calculateTargetPitch(newZoom);

    // Update the target refs. The main component's animation loop will handle the smooth transition.
    targetPositionRef.current.zoom = newZoom;
    targetViewRef.current.pitch = newPitch;
  }, [config, targetPositionRef, targetViewRef, calculateTargetPitch]);


  const handleWheel = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();

    const zoomDelta = -(event.deltaY / 100) * config.zoomSensitivity;
    applyZoomDelta(zoomDelta);
  }, [enabled, config.zoomSensitivity, applyZoomDelta]);

  // --- TOUCH HANDLERS ---

  const handleTouchStart = useCallback((event) => {
    if (!enabled) return;
    // Check for two-finger touch to start the pinch gesture
    if (event.touches.length === 2) {
      event.preventDefault(); // Prevent default browser actions like page zoom
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      // Calculate and store the initial distance
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchPrevDistRef.current = dist;
    }
  }, [enabled]);

  const handleTouchMove = useCallback((event) => {
    // A pinch gesture must be active (prev dist is not null) and must have two fingers
    if (!enabled || pinchPrevDistRef.current === null || event.touches.length !== 2) {
      return;
    }
    event.preventDefault();

    const t1 = event.touches[0];
    const t2 = event.touches[1];
    const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    // Calculate the change in distance from the last move event
    const deltaDistance = currentDist - pinchPrevDistRef.current;

    // Convert the distance change to a zoom delta
    const zoomDelta = deltaDistance * config.touchZoomSensitivity;

    applyZoomDelta(zoomDelta);

    // Update the previous distance for the next move event
    pinchPrevDistRef.current = currentDist;
  }, [enabled, config.touchZoomSensitivity, applyZoomDelta]);

  const handleTouchEnd = useCallback(() => {
    // Reset pinch tracking when the gesture ends
    pinchPrevDistRef.current = null;
  }, []);


  useEffect(() => {
    const element = window;

    // Add wheel event listener
    element.addEventListener('wheel', handleWheel, { passive: false });

    // Add touch event listeners for pinch-to-zoom
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Cleanup: remove all event listeners when the component unmounts
    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);
};

export default useZoomPitchControl;