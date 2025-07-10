// src/useSmoothCameraUpdate.js

import { useEffect, useRef } from 'react';

/**
 * Custom hook to handle smooth camera updates and animations
 * @param {Object} params - Hook parameters
 * @param {Object} params.viewState - Current view state
 * @param {Function} params.setViewState - View state setter
 * @param {Object} params.smoothnessSettings - Smoothness configuration
 * @param {boolean} params.ambientMovementEnabled - Whether ambient movement is enabled
 * @param {boolean} params.isPinTransition - Whether a pin transition is active
 * @param {React.MutableRefObject} params.targetViewRef - Target view reference
 * @param {React.MutableRefObject} params.targetPositionRef - Target position reference
 * @param {React.MutableRefObject} params.leftDragVelocityRef - Drag velocity reference
 * @param {React.MutableRefObject} params.isDraggingRef - Dragging state reference
 * @param {React.MutableRefObject} params.isTouchDraggingRef - Touch dragging state reference
 * @param {React.MutableRefObject} params.mouseInfluenceRef - Mouse influence reference
 * @param {React.MutableRefObject} params.shouldStayAtPinPositionRef - Pin position lock reference
 * @param {Function} params.clampToRadius - Boundary clamping function
 */
const useSmoothCameraUpdate = ({
  viewState,
  setViewState,
  smoothnessSettings,
  ambientMovementEnabled,
  isPinTransition,
  targetViewRef,
  targetPositionRef,
  leftDragVelocityRef,
  isDraggingRef,
  isTouchDraggingRef,
  mouseInfluenceRef,
  shouldStayAtPinPositionRef,
  clampToRadius
}) => {
  const animationFrameRef = useRef();
  const prevViewStateRef = useRef(null);

  // Enhanced interpolation with momentum preservation
  const smoothInterpolate = (current, target, factor, momentum = 0) => {
    const diff = target - current;
    const newValue = current + diff * factor + momentum;
    return newValue;
  };

  useEffect(() => {
    const smoothUpdate = () => {
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(smoothUpdate);
        return;
      }

      setViewState(prev => {
        const currentPitch = prev.pitch;
        const currentBearing = prev.bearing;
        const currentLatitude = prev.latitude;
        const currentLongitude = prev.longitude;
        const currentZoom = prev.zoom;

        prevViewStateRef.current = {
          pitch: currentPitch,
          bearing: currentBearing,
          latitude: currentLatitude,
          longitude: currentLongitude,
          zoom: currentZoom
        };

        let newPitch = currentPitch;
        let newBearing = currentBearing;
        let newLatitude = currentLatitude;
        let newLongitude = currentLongitude;
        let newZoom = currentZoom;

        // Use a single smooth factor for idle interpolation
        const smoothFactor = 1 - smoothnessSettings.ambientSmoothness;

        if (isDraggingRef.current || isTouchDraggingRef.current) {
          // When dragging starts, disable pin position staying
          shouldStayAtPinPositionRef.current = false;
          
          const dragSmoothFactor = smoothnessSettings.dragLerpFactor;
          newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, dragSmoothFactor);
          newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, dragSmoothFactor);
          newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, dragSmoothFactor);
          newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, dragSmoothFactor);
          
          // Handle zoom interpolation during drag
          newZoom = smoothInterpolate(currentZoom, targetPositionRef.current.zoom, dragSmoothFactor);
          
          const clamped = clampToRadius(newLatitude, newLongitude);
          newLatitude = clamped.latitude;
          newLongitude = clamped.longitude;

        } else {
          // INERTIA (after drag)
          if (Math.abs(leftDragVelocityRef.current.bearing) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.pitch) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.latitude) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.longitude) > smoothnessSettings.stopThreshold) {
            
            newBearing += leftDragVelocityRef.current.bearing;
            newPitch = Math.max(0, Math.min(85, newPitch + leftDragVelocityRef.current.pitch));
            newLatitude += leftDragVelocityRef.current.latitude;
            newLongitude += leftDragVelocityRef.current.longitude;

            const clamped = clampToRadius(newLatitude, newLongitude);
            newLatitude = clamped.latitude;
            newLongitude = clamped.longitude;

            // Apply damping
            leftDragVelocityRef.current.bearing *= smoothnessSettings.leftDampingFactor;
            leftDragVelocityRef.current.pitch *= smoothnessSettings.leftDampingFactor;
            leftDragVelocityRef.current.latitude *= smoothnessSettings.leftDampingFactor;
            leftDragVelocityRef.current.longitude *= smoothnessSettings.leftDampingFactor;

            // After a drag, smoothly return to the target zoom/pitch set by the wheel
            newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * smoothFactor;
            newPitch = currentPitch + (targetViewRef.current.pitch - currentPitch) * smoothFactor;

            // Update targets to reflect inertia
            targetViewRef.current = { pitch: newPitch, bearing: newBearing };
            targetPositionRef.current.latitude = newLatitude;
            targetPositionRef.current.longitude = newLongitude;

          } 
          // AMBIENT MOVEMENT or WHEEL CONTROL (Idle state)
          else if (ambientMovementEnabled) {
            const basePitch = targetViewRef.current.pitch;
            const baseBearing = targetViewRef.current.bearing;
            const baseLatitude = targetPositionRef.current.latitude;
            const baseLongitude = targetPositionRef.current.longitude;

            const mouseInfluenceX = mouseInfluenceRef.current.x;
            const mouseInfluenceY = mouseInfluenceRef.current.y;

            const pitchInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxPitch;
            const bearingInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxBearing;
            const latInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxLatOffset;
            const lngInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxLngOffset;

            const ambientTargetPitch = Math.max(0, Math.min(85, basePitch + pitchInfluence));
            const ambientTargetBearing = baseBearing + bearingInfluence;
            
            let ambientTargetLatitude = baseLatitude + latInfluence;
            let ambientTargetLongitude = baseLongitude + lngInfluence;
            
            const clamped = clampToRadius(ambientTargetLatitude, ambientTargetLongitude);
            ambientTargetLatitude = clamped.latitude;
            ambientTargetLongitude = clamped.longitude;

            newPitch = currentPitch + (ambientTargetPitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (ambientTargetBearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (ambientTargetLatitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (ambientTargetLongitude - currentLongitude) * smoothFactor;
            
            // Make zoom interpolate to its target
            newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * smoothFactor;

          } else {
            // Final fallback: smoothly interpolate to target state
            newPitch = currentPitch + (targetViewRef.current.pitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (targetViewRef.current.bearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (targetPositionRef.current.latitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (targetPositionRef.current.longitude - currentLongitude) * smoothFactor;
            newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * smoothFactor;
          }
        }

        // Clamp final values
        newPitch = Math.max(0, Math.min(85, newPitch));
        newZoom = Math.max(smoothnessSettings.minZoom, Math.min(smoothnessSettings.maxZoom, newZoom));

        return {
          ...prev,
          pitch: newPitch,
          bearing: newBearing,
          latitude: newLatitude,
          longitude: newLongitude,
          zoom: newZoom,
          transitionDuration: 0
        };
      });
      animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [
    viewState,
    setViewState,
    smoothnessSettings,
    ambientMovementEnabled,
    isPinTransition,
    targetViewRef,
    targetPositionRef,
    leftDragVelocityRef,
    isDraggingRef,
    isTouchDraggingRef,
    mouseInfluenceRef,
    shouldStayAtPinPositionRef,
    clampToRadius
  ]);

  // Return the previous view state ref for external use if needed
  return { prevViewStateRef };
};

export default useSmoothCameraUpdate;
