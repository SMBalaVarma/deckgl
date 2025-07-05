// src/useZoomPitchControl.js

import { useEffect, useCallback, useRef } from 'react';

/**
 * A custom hook to control camera zoom and pitch based on wheel and touch events.
 * It integrates with an existing animation loop by updating target refs.
 * ... (rest of the JSDoc)
 */
const useZoomPitchControl = ({
  targetPositionRef,
  targetViewRef,
  enabled = true,
  config: userConfig = {},
}) => {
  // Merge user config with defaults
  const config = {
    zoomSensitivity: 2,
    touchZoomSensitivity: 0.02,
    minZoom: 13.5,
    maxZoom: 16.0,
    minPitch: 0,
    maxPitch: 60,
    ...userConfig,
  };
  
  // --- Refs for pinch-to-zoom gesture ---
  const pinchStartZoomRef = useRef(null);
  const pinchStartDistRef = useRef(null);
  const isPinchingRef = useRef(false);
  const lastUpdateRef = useRef({ zoom: null, pitch: null }); // Track last update

  // Helper function to interpolate pitch based on the current zoom level.
  const calculateTargetPitch = useCallback((zoom) => {
    const { minZoom, maxZoom, minPitch, maxPitch } = config;

    if (zoom <= minZoom) return minPitch;
    if (zoom >= maxZoom) return maxPitch;

    const progress = (zoom - minZoom) / (maxZoom - minZoom);
    return minPitch + progress * (maxPitch - minPitch);
  }, [config]);

  // A function to update both zoom and pitch together with forced synchronization
  const updateZoomAndPitch = useCallback((newZoomValue) => {
    // Clamp the zoom to the desired min/max range
    const newZoom = Math.max(config.minZoom, Math.min(config.maxZoom, newZoomValue));
    const newPitch = calculateTargetPitch(newZoom);

    // Store the values we're about to set
    lastUpdateRef.current = { zoom: newZoom, pitch: newPitch };

    // Force both updates to happen in the same JavaScript execution context
    // This prevents any async behavior from separating the updates
    const currentPosition = targetPositionRef.current;
    const currentView = targetViewRef.current;
    
    // Update both refs with a single assignment each
    targetPositionRef.current = { ...currentPosition, zoom: newZoom };
    targetViewRef.current = { ...currentView, pitch: newPitch };
    
    // Force a microtask to ensure both updates are committed
    Promise.resolve().then(() => {
      // Verify the updates took effect
      if (targetPositionRef.current.zoom !== newZoom || targetViewRef.current.pitch !== newPitch) {
        console.warn('Zoom/Pitch update synchronization failed, forcing re-update');
        targetPositionRef.current = { ...targetPositionRef.current, zoom: newZoom };
        targetViewRef.current = { ...targetViewRef.current, pitch: newPitch };
      }
    });
  }, [config, targetPositionRef, targetViewRef, calculateTargetPitch]);

  const handleWheel = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();

    const zoomDelta = -(event.deltaY / 100) * config.zoomSensitivity;
    const newZoom = targetPositionRef.current.zoom + zoomDelta;
    updateZoomAndPitch(newZoom);
  }, [enabled, config.zoomSensitivity, updateZoomAndPitch, targetPositionRef]);

  // --- TOUCH HANDLERS ---

  const handleTouchStart = useCallback((event) => {
    if (!enabled) return;
    
    if (event.touches.length === 2) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      
      pinchStartDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartZoomRef.current = targetPositionRef.current.zoom;
      isPinchingRef.current = true;
    }
  }, [enabled, targetPositionRef]);

  const handleTouchMove = useCallback((event) => {
    if (!enabled || !isPinchingRef.current) return;
    
    if (event.touches.length >= 2) {
      event.preventDefault();
      
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      const deltaDistance = currentDist - pinchStartDistRef.current;
      const zoomDelta = deltaDistance * config.touchZoomSensitivity;
      const newZoom = pinchStartZoomRef.current + zoomDelta;
      
      // Use our synchronized update function
      updateZoomAndPitch(newZoom);
    }
  }, [enabled, config.touchZoomSensitivity, updateZoomAndPitch]);

  const handleTouchEnd = useCallback((event) => {
    if (!enabled) return;
    
    if (event.touches.length < 2) {
      // Final synchronization update
      if (isPinchingRef.current && lastUpdateRef.current.zoom !== null) {
        updateZoomAndPitch(lastUpdateRef.current.zoom);
      }
      
      // Reset gesture state
      pinchStartDistRef.current = null;
      pinchStartZoomRef.current = null;
      isPinchingRef.current = false;
      lastUpdateRef.current = { zoom: null, pitch: null };
    }
  }, [enabled, updateZoomAndPitch]);

  useEffect(() => {
    const element = window;

    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);
};

export default useZoomPitchControl;