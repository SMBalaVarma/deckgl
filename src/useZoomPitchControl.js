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
  const isPinchingRef = useRef(false); // Track if we're in a pinch gesture

  // Helper function to interpolate pitch based on the current zoom level.
  const calculateTargetPitch = useCallback((zoom) => {
    const { minZoom, maxZoom, minPitch, maxPitch } = config;

    if (zoom <= minZoom) return minPitch;
    if (zoom >= maxZoom) return maxPitch;

    const progress = (zoom - minZoom) / (maxZoom - minZoom);
    return minPitch + progress * (maxPitch - minPitch);
  }, [config]);

  // A generic function to set a new zoom level, clamp it, and update the refs.
  // This ensures both zoom and pitch are updated simultaneously.
  const setZoom = useCallback((newZoomValue) => {
    // Clamp the zoom to the desired min/max range
    const newZoom = Math.max(config.minZoom, Math.min(config.maxZoom, newZoomValue));

    // Calculate the corresponding pitch for the new zoom level
    const newPitch = calculateTargetPitch(newZoom);

    // Update BOTH refs in a single operation to ensure they're truly synchronized
    // Use Object.assign to make it atomic
    Object.assign(targetPositionRef.current, { zoom: newZoom });
    Object.assign(targetViewRef.current, { pitch: newPitch });
  }, [config, targetPositionRef, targetViewRef, calculateTargetPitch]);

  const handleWheel = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();

    const zoomDelta = -(event.deltaY / 100) * config.zoomSensitivity;
    const newZoom = targetPositionRef.current.zoom + zoomDelta;
    setZoom(newZoom);
  }, [enabled, config.zoomSensitivity, setZoom, targetPositionRef]);

  // --- TOUCH HANDLERS (IMPROVED LOGIC) ---

  const handleTouchStart = useCallback((event) => {
    if (!enabled) return;
    
    // Check for two-finger touch to start the pinch gesture
    if (event.touches.length === 2) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      
      // Initialize pinch gesture
      pinchStartDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartZoomRef.current = targetPositionRef.current.zoom;
      isPinchingRef.current = true;
    }
  }, [enabled, targetPositionRef]);

  const handleTouchMove = useCallback((event) => {
    if (!enabled || !isPinchingRef.current) return;
    
    // Continue pinch gesture even if finger count changes momentarily
    if (event.touches.length >= 2) {
      event.preventDefault();
      
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      // Calculate change from the START of the gesture
      const deltaDistance = currentDist - pinchStartDistRef.current;
      const zoomDelta = deltaDistance * config.touchZoomSensitivity;
      
      // Calculate the new zoom based on the initial zoom + total change so far
      const newZoom = pinchStartZoomRef.current + zoomDelta;
      
      // Clamp the zoom immediately
      const clampedZoom = Math.max(config.minZoom, Math.min(config.maxZoom, newZoom));
      
      // Calculate pitch immediately
      const newPitch = calculateTargetPitch(clampedZoom);
      
      // Update both values directly and simultaneously
      targetPositionRef.current.zoom = clampedZoom;
      targetViewRef.current.pitch = newPitch;
    }
  }, [enabled, config.touchZoomSensitivity, config.minZoom, config.maxZoom, calculateTargetPitch, targetPositionRef, targetViewRef]);

  const handleTouchEnd = useCallback((event) => {
    if (!enabled) return;
    
    // End pinch gesture when we have fewer than 2 touches
    if (event.touches.length < 2) {
      // Reset gesture state
      pinchStartDistRef.current = null;
      pinchStartZoomRef.current = null;
      isPinchingRef.current = false;
    }
  }, [enabled]);

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