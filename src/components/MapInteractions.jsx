import { useEffect, useRef } from 'react';
import { isMobile } from 'react-device-detect';

export const MapInteractions = ({
  viewState,
  setViewState,
  smoothnessSettings,
  ambientMovementEnabled,
  isInWheelMode,
  setIsInWheelMode,
  wheelModeProgressRef,
  wheelModeTargetProgressRef,
  isPinTransition,
  targetViewRef,
  animationFrameRef,
  prevViewStateRef,
  leftDragVelocityRef,
  targetPositionRef,
  baseZoomRef,
  tempZoomOffsetRef,
  isInertiaActiveRef,
  wrapperRef,
  shouldStayAtPinPositionRef,
  isAnimationLockedRef,
  isDragging,
  setIsDragging,
  selectedId,
  setSelectedId,
  setSelectedPin,
  setHoverInfo,
  hoverInfo,
  selectedPin,
  clampToRadius,
  smoothInterpolate,
  CENTER_POINT,
  MAX_RADIUS,
  SMOOTH_DRAG_ZOOM_LEVEL,
  isManualZoomRef
}) => {
  const mouseInfluenceRef = useRef({ x: 0, y: 0 });
  const isPinchingRef = useRef(false);
  const initialPinchDistanceRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragPrevRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const floatingVelocityRef = useRef({ x: 0, y: 0 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const lastMouseTimeRef = useRef(Date.now());
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchPrevRef = useRef({ x: 0, y: 0 });
  const isTouchDraggingRef = useRef(false);
  const touchCountRef = useRef(0);
  const isZoomDraggingRef = useRef(false);
  const lastDragVelocityRef = useRef({ bearing: 0, lat: 0, lng: 0 });
  const lastDragTimestampRef = useRef(Date.now());

  const clampVelocity = (velocity, maxValue) => {
    return Math.max(-maxValue, Math.min(maxValue, velocity));
  };

  // Wheel handling effect
  useEffect(() => {
    const handleWheel = (e) => {
      if (shouldStayAtPinPositionRef.current || isManualZoomRef.current) {
        return;
      }

      if (!isInWheelMode) {
        setIsInWheelMode(true);
        leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };

        targetPositionRef.current = {
          latitude: viewState.latitude,
          longitude: viewState.longitude,
          zoom: viewState.zoom
        };

        const START_ZOOM = 16;
        const END_ZOOM = isMobile ? 13.5 : 13.5;
        const currentZoom = viewState.zoom;

        const progress = (currentZoom - START_ZOOM) / (END_ZOOM - START_ZOOM);
        const clampedProgress = Math.max(0, Math.min(1, progress));

        wheelModeProgressRef.current = clampedProgress;
        wheelModeTargetProgressRef.current = clampedProgress;
      }

      const scrollAmount = e.deltaY * 0.0015;
      wheelModeTargetProgressRef.current = Math.max(0, Math.min(1, wheelModeTargetProgressRef.current + scrollAmount));

      e.preventDefault();
    };

    const container = wrapperRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [isInWheelMode, viewState.zoom]);

  // Main animation loop
  useEffect(() => {
    const smoothUpdate = () => {
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(smoothUpdate);
        return;
      }

      setViewState(prev => {
        if (isPinTransition) {
          return prev;
        }

        if (isInWheelMode) {
          const progressDiff = wheelModeTargetProgressRef.current - wheelModeProgressRef.current;
          wheelModeProgressRef.current += progressDiff * 0.08;

          const START_ZOOM = 16;
          const END_ZOOM = isMobile ? 13.5 : 13.5;
          const START_PITCH = 60;
          const END_PITCH = 0;

          const lerp = (a, b, t) => a * (1 - t) + b * t;
          const newZoom = lerp(START_ZOOM, END_ZOOM, wheelModeProgressRef.current);
          const newPitch = lerp(START_PITCH, END_PITCH, wheelModeProgressRef.current);
          
          if (wheelModeProgressRef.current < 0.01 && wheelModeTargetProgressRef.current === 0) {
            setIsInWheelMode(false);
            baseZoomRef.current = prev.zoom;
          }

          return {
            ...prev,
            zoom: newZoom,
            pitch: newPitch,
            transitionDuration: 0,
          };
        }
        
        const {
          pitch: currentPitch,
          bearing: currentBearing,
          latitude: currentLatitude,
          longitude: currentLongitude,
          zoom: currentZoom
        } = prev;

        prevViewStateRef.current = { ...prev };

        let newPitch = currentPitch;
        let newBearing = currentBearing;
        let newLatitude = currentLatitude;
        let newLongitude = currentLongitude;
        let newZoom = currentZoom;
        
        if (isDraggingRef.current || isTouchDraggingRef.current) {
          shouldStayAtPinPositionRef.current = false;
          isInertiaActiveRef.current = false;
          
          newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, smoothnessSettings.dragLerpFactor);
          newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, smoothnessSettings.dragLerpFactor);
          newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, smoothnessSettings.dragLerpFactor);
          newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, smoothnessSettings.dragLerpFactor);
          newZoom = smoothInterpolate(currentZoom, baseZoomRef.current + tempZoomOffsetRef.current, smoothnessSettings.dragLerpFactor);

          const clamped = clampToRadius(newLatitude, newLongitude);
          newLatitude = clamped.latitude;
          newLongitude = clamped.longitude;

        } else {
          let baseLatitude, baseLongitude, basePitch, baseBearing, baseZoom;

          const hasInertia = (
            Math.abs(leftDragVelocityRef.current.bearing) > 0.01 ||
            Math.abs(leftDragVelocityRef.current.pitch) > 0.01 ||
            Math.abs(leftDragVelocityRef.current.latitude) > 0.001 ||
            Math.abs(leftDragVelocityRef.current.longitude) > 0.001 ||
            Math.abs(leftDragVelocityRef.current.zoom) > 0.01
          );

          isInertiaActiveRef.current = hasInertia;

          if (shouldStayAtPinPositionRef.current) {
            baseLatitude = targetPositionRef.current.latitude;
            baseLongitude = targetPositionRef.current.longitude;
            basePitch = targetViewRef.current.pitch;
            baseBearing = targetViewRef.current.bearing;
            baseZoom = targetPositionRef.current.zoom;
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          
          } else if (hasInertia) {
            baseBearing = currentBearing + leftDragVelocityRef.current.bearing;
            basePitch = currentPitch + leftDragVelocityRef.current.pitch;
            let tempLat = currentLatitude + leftDragVelocityRef.current.latitude;
            let tempLng = currentLongitude + leftDragVelocityRef.current.longitude;
            
            const clamped = clampToRadius(tempLat, tempLng);
            baseLatitude = clamped.latitude;
            baseLongitude = clamped.longitude;
            
            if (clamped.isAtBoundary) {
              const bounceFactor = 0.3;
              leftDragVelocityRef.current.latitude *= -bounceFactor;
              leftDragVelocityRef.current.longitude *= -bounceFactor;
              
              leftDragVelocityRef.current.bearing *= 0.7;
              leftDragVelocityRef.current.pitch *= 0.7;
              leftDragVelocityRef.current.zoom *= 0.8;
            }

            baseZoom = currentZoom + leftDragVelocityRef.current.zoom;

            targetPositionRef.current = {
              latitude: baseLatitude,
              longitude: baseLongitude,
              zoom: baseZoom
            };
            targetViewRef.current = {
              pitch: basePitch,
              bearing: baseBearing
            };
            baseZoomRef.current = baseZoom;

            const decay = 0.97;
            leftDragVelocityRef.current.bearing *= decay;
            leftDragVelocityRef.current.pitch *= decay;
            leftDragVelocityRef.current.latitude *= decay;
            leftDragVelocityRef.current.longitude *= decay;
            leftDragVelocityRef.current.zoom *= decay;
          } else {
            const wasInertiaActive = isInertiaActiveRef.current;
            isInertiaActiveRef.current = false;
            
            if (wasInertiaActive) {
              targetPositionRef.current = {
                latitude: currentLatitude,
                longitude: currentLongitude,
                zoom: currentZoom
              };
              targetViewRef.current = {
                pitch: currentPitch,
                bearing: currentBearing
              };
              baseZoomRef.current = currentZoom;
            }
            baseLatitude = targetPositionRef.current.latitude;
            baseLongitude = targetPositionRef.current.longitude;
            basePitch = targetViewRef.current.pitch;
            baseBearing = targetViewRef.current.bearing;
            baseZoom = targetPositionRef.current.zoom;
          }

          if (ambientMovementEnabled && !isInertiaActiveRef.current) {
            const mouseInfluenceX = mouseInfluenceRef.current.x;
            const mouseInfluenceY = mouseInfluenceRef.current.y;

            const pitchInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxPitchOffset;
            const bearingInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxBearingOffset;

            const ambientTargetPitch = basePitch + pitchInfluence;
            const ambientTargetBearing = baseBearing + bearingInfluence;
            const ambientTargetLatitude = baseLatitude + (mouseInfluenceY * smoothnessSettings.ambientMaxLatOffset);
            const ambientTargetLongitude = baseLongitude + (mouseInfluenceX * smoothnessSettings.ambientMaxLngOffset);
            
            const smoothFactor = 1 - smoothnessSettings.ambientSmoothness;
            newPitch = smoothInterpolate(currentPitch, ambientTargetPitch, smoothFactor);
            newBearing = smoothInterpolate(currentBearing, ambientTargetBearing, smoothFactor);
            newLatitude = smoothInterpolate(currentLatitude, ambientTargetLatitude, smoothFactor);
            newLongitude = smoothInterpolate(currentLongitude, ambientTargetLongitude, smoothFactor);
            newZoom = smoothInterpolate(currentZoom, baseZoom, smoothFactor);

          } else {
            const smoothFactor = smoothnessSettings.leftSmoothFactor;
            newPitch = smoothInterpolate(currentPitch, basePitch, smoothFactor);
            newBearing = smoothInterpolate(currentBearing, baseBearing, smoothFactor);
            newLatitude = smoothInterpolate(currentLatitude, baseLatitude, smoothFactor);
            newLongitude = smoothInterpolate(currentLongitude, baseLongitude, smoothFactor);
            newZoom = smoothInterpolate(currentZoom, baseZoom, smoothFactor);
          }
        }
        
        newPitch = Math.max(0, Math.min(85, newPitch));
        newZoom = Math.max(smoothnessSettings.minZoom, Math.min(smoothnessSettings.maxZoom, newZoom));
        const finalClamped = clampToRadius(newLatitude, newLongitude);

        return {
          ...prev,
          pitch: newPitch,
          bearing: newBearing,
          latitude: finalClamped.latitude,
          longitude: finalClamped.longitude,
          zoom: newZoom,
          transitionDuration: 0
        };
      });
      animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [smoothnessSettings, ambientMovementEnabled, isInWheelMode, isPinTransition]);

  // Mouse and touch event handlers
  useEffect(() => {
    const handleDragMovement = (x, y, buttons) => {
      const now = Date.now();
      const deltaTime = now - lastDragTimestampRef.current;
      lastDragTimestampRef.current = now;

      const prevX = isDraggingRef.current ? dragPrevRef.current.x : touchPrevRef.current.x;
      const prevY = isDraggingRef.current ? dragPrevRef.current.y : touchPrevRef.current.y;
      const deltaX = x - prevX;
      const deltaY = y - prevY;

      if ((isDraggingRef.current || isTouchDraggingRef.current) && selectedPin) {
        const startX = isDraggingRef.current ? dragStartRef.current.x : touchStartRef.current.x;
        const startY = isDraggingRef.current ? dragStartRef.current.y : touchStartRef.current.y;
        const movementX = Math.abs(x - startX);
        const movementY = Math.abs(y - startY);
        const dragStartThreshold = 3;
        if (movementX > dragStartThreshold || movementY > dragStartThreshold) {
          if (selectedPin) {
            setSelectedPin(null);
            setSelectedId(null);
            setHoverInfo(null);
          }
        }
      }

      if (buttons === 2 && isDraggingRef.current) {
        targetViewRef.current = {
          pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)),
          bearing: targetViewRef.current.bearing - deltaX * 0.35
        };
      } else if (buttons === 1) {
        const oldLat = targetPositionRef.current.latitude;
        const oldLng = targetPositionRef.current.longitude;
        
        const currentZoom = baseZoomRef.current;
        const {
          rotationSpeedMinZoom,
          rotationSpeedMaxZoom,
          rotationSpeedAtMinZoom,
          rotationSpeedAtMaxZoom
        } = smoothnessSettings;

        const rotationZoomRange = rotationSpeedMaxZoom - rotationSpeedMinZoom;
        const rotationProgress = (currentZoom - rotationSpeedMinZoom) / (rotationZoomRange > 0 ? rotationZoomRange : 1);
        const clampedRotationProgress = Math.max(0, Math.min(1, rotationProgress));
        const dynamicRotationSpeed = rotationSpeedAtMinZoom + (rotationSpeedAtMaxZoom - rotationSpeedAtMinZoom) * clampedRotationProgress;

        const bearingChange = -deltaX * dynamicRotationSpeed;
        targetViewRef.current.bearing += bearingChange;
        lastDragVelocityRef.current.bearing = bearingChange;

        isZoomDraggingRef.current = true;
        
        const {
          forwardSpeedMinZoom,
          forwardSpeedMaxZoom,
          forwardSpeedAtMinZoom,
          forwardSpeedAtMaxZoom
        } = smoothnessSettings;

        const zoomRange = forwardSpeedMaxZoom - forwardSpeedMinZoom;
        const progress = (currentZoom - forwardSpeedMinZoom) / (zoomRange > 0 ? zoomRange : 1);
        const clampedProgress = Math.max(0, Math.min(1, progress));
        const dynamicForwardSpeed = forwardSpeedAtMinZoom + (forwardSpeedAtMaxZoom - forwardSpeedAtMinZoom) * clampedProgress;
        
        const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
        const zoomFactor = Math.pow(2, baseZoomRef.current);
        const effectiveMoveSpeed = dynamicForwardSpeed / zoomFactor * 100;
        const moveDistance = deltaY * effectiveMoveSpeed * 0.5;

        const newLat = targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance;
        const newLng = targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance;
        const clamped = clampToRadius(newLat, newLng);

        targetPositionRef.current = {
          ...targetPositionRef.current,
          latitude: clamped.latitude,
          longitude: clamped.longitude
        };
        
        lastDragVelocityRef.current.lat = targetPositionRef.current.latitude - oldLat;
        lastDragVelocityRef.current.lng = targetPositionRef.current.longitude - oldLng;
      }

      if (isDraggingRef.current) {
        dragPrevRef.current = { x, y };
      }
      if (isTouchDraggingRef.current) {
        touchPrevRef.current = { x, y };
      }
    };

    const commonDragEndLogic = (isTouchEvent = false) => {
      setViewState(currentViewState => {
        if (prevViewStateRef.current && currentViewState) {
          const bearingDelta = currentViewState.bearing - prevViewStateRef.current.bearing;
          const pitchDelta = (isDraggingRef.current && !isZoomDraggingRef.current && !isTouchEvent) 
            ? (currentViewState.pitch - prevViewStateRef.current.pitch) 
            : 0;
          const latDelta = currentViewState.latitude - prevViewStateRef.current.latitude;
          const lngDelta = currentViewState.longitude - prevViewStateRef.current.longitude;

          const inertiaMultiplier = 0.8;
          let zoomVelocity = 0;

          if (!shouldStayAtPinPositionRef.current) {
            const currentEffectiveZoom = baseZoomRef.current + tempZoomOffsetRef.current;
            const zoomDiffToStable = SMOOTH_DRAG_ZOOM_LEVEL - currentEffectiveZoom;

            if (Math.abs(zoomDiffToStable) > 0.01) {
              zoomVelocity = zoomDiffToStable * 0.05;
            }
          }

          leftDragVelocityRef.current = {
            bearing: clampVelocity(bearingDelta * inertiaMultiplier, 3),
            pitch: clampVelocity(pitchDelta * inertiaMultiplier, 2),
            latitude: clampVelocity(latDelta * inertiaMultiplier, 0.05),
            longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.05),
            zoom: clampVelocity(zoomVelocity, 0.2)
          };

          isInertiaActiveRef.current = true;

          targetPositionRef.current = {
            latitude: currentViewState.latitude,
            longitude: currentViewState.longitude,
            zoom: currentViewState.zoom
          };
          targetViewRef.current = {
            pitch: currentViewState.pitch,
            bearing: currentViewState.bearing
          };
          baseZoomRef.current = currentViewState.zoom;
        }

        if (isTouchEvent) {
          isTouchDraggingRef.current = false;
        } else {
          isDraggingRef.current = false;
        }
        setIsDragging(false);
        isZoomDraggingRef.current = false;
        tempZoomOffsetRef.current = 0;

        return currentViewState;
      });
    }; 

    const handleMouseDown = (e) => {
      if (isAnimationLockedRef.current) {
        return;
      }
      if (e.button === 0 || e.button === 2) {
        
        if (isInWheelMode) {
            setIsInWheelMode(false);
            wheelModeProgressRef.current = 0;
            wheelModeTargetProgressRef.current = 0;
        }

        const { latitude, longitude, zoom, pitch, bearing } = viewState;

        if (selectedId) {
          shouldStayAtPinPositionRef.current = false;
        }
    
        isDraggingRef.current = true;
        setIsDragging(true);
        
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragPrevRef.current = { x: e.clientX, y: e.clientY };
        
        leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
        floatingVelocityRef.current = { x: 0, y: 0 };
        
        targetPositionRef.current = { latitude, longitude, zoom };
        targetViewRef.current = { pitch, bearing };
        baseZoomRef.current = zoom;
        tempZoomOffsetRef.current = 0;

        isZoomDraggingRef.current = (e.button === 0);
      }
    };

    const handleMouseUp = (e) => {
      if ((e.button === 0 || e.button === 2) && isDraggingRef.current) {
        commonDragEndLogic(false);
      }
    };

    const handleTouchStart = (e) => {
      if (isAnimationLockedRef.current) {
        return;
      }
      
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinchingRef.current = true;
        isTouchDraggingRef.current = false;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        initialPinchDistanceRef.current = distance;

        if (!isInWheelMode) {
          setIsInWheelMode(true);
          leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };

          const START_ZOOM = 16;
          const END_ZOOM = isMobile ? 13.5 : 13.5;
          const currentZoom = viewState.zoom;
          
          const progress = (currentZoom - START_ZOOM) / (END_ZOOM - START_ZOOM);
          const clampedProgress = Math.max(0, Math.min(1, progress));

          wheelModeProgressRef.current = clampedProgress;
          wheelModeTargetProgressRef.current = clampedProgress;
        }
        return;
      }
      
      if (e.touches.length === 1) {
        e.preventDefault();
        
        if (isInWheelMode) {
            setIsInWheelMode(false);
            wheelModeProgressRef.current = 0;
            wheelModeTargetProgressRef.current = 0;
        }

        const { latitude, longitude, zoom, pitch, bearing } = viewState;
        
        if (selectedId) {
          shouldStayAtPinPositionRef.current = false;
        }

        const touch = e.touches[0];
        isTouchDraggingRef.current = true;
        setIsDragging(true);
    
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        touchPrevRef.current = { x: touch.clientX, y: touch.clientY };

        leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
        floatingVelocityRef.current = { x: 0, y: 0 };
        
        targetPositionRef.current = { latitude, longitude, zoom };
        targetViewRef.current = { pitch, bearing };
        baseZoomRef.current = zoom;
        tempZoomOffsetRef.current = 0;
        isZoomDraggingRef.current = true;
      }
    };

    const handleTouchMove = (e) => {
      if (isAnimationLockedRef.current) {
        e.preventDefault(); 
        return;
      }
      if (e.touches.length === 2 && isPinchingRef.current && initialPinchDistanceRef.current) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        
        const pinchRatio = currentDistance / initialPinchDistanceRef.current;
        const pinchSensitivity = 2.5;
        const progressDelta = (1 - pinchRatio) * pinchSensitivity;

        wheelModeTargetProgressRef.current = Math.max(0, Math.min(1, wheelModeProgressRef.current + progressDelta));
        initialPinchDistanceRef.current = currentDistance;
        return; 
      }

      if (isTouchDraggingRef.current && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        handleDragMovement(touch.clientX, touch.clientY, 1);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
          isPinchingRef.current = false;
          initialPinchDistanceRef.current = null;
      }
      
      if (isTouchDraggingRef.current && e.changedTouches.length > 0 && e.touches.length === 0) {
        commonDragEndLogic(true);
      }
    };

    const handleMouseMoveForAmbient = (e) => {
      if (isAnimationLockedRef.current) {
        return;
      }
      if (ambientMovementEnabled && !isDraggingRef.current && !isTouchDraggingRef.current ) {
        const x = e.clientX;
        const y = e.clientY;
        const currentTime = Date.now();
        const deltaTime = currentTime - lastMouseTimeRef.current;

        if (deltaTime > 0) {
          const deltaX = x - lastMousePosRef.current.x;
          const deltaY = y - lastMousePosRef.current.y;
          mouseVelocityRef.current.x = clampVelocity(deltaX / deltaTime, 2);
          mouseVelocityRef.current.y = clampVelocity(deltaY / deltaTime, 2);
        }

        lastMousePosRef.current = { x, y };
        lastMouseTimeRef.current = currentTime;

        const { innerWidth, innerHeight } = window;
        const xNorm = (x / innerWidth) * 2 - 1;
        const yNorm = (y / innerHeight) * 2 - 1;
        mouseInfluenceRef.current = { x: xNorm, y: yNorm };
      }
      
      if (isDraggingRef.current) {
        handleDragMovement(e.clientX, e.clientY, e.buttons || 1);
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMoveForAmbient);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    const preventDefaultContextMenu = (e) => e.preventDefault();
    window.addEventListener('contextmenu', preventDefaultContextMenu);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMoveForAmbient);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('contextmenu', preventDefaultContextMenu);
    };
  }, [viewState, selectedId, hoverInfo, smoothnessSettings, ambientMovementEnabled, shouldStayAtPinPositionRef.current]);

  return null; // This component only handles interactions, no rendering
};
