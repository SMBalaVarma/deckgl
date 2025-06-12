import React, { useState, useEffect, useRef } from 'react';
import DeckGL, { IconLayer, PathLayer } from 'deck.gl';
import { FlyToInterpolator } from '@deck.gl/core';
import { isMobile } from 'react-device-detect';
import Map from 'react-map-gl/mapbox';
import NationalParksData from './data.json';
import mapIcon from './gold-pointer.png';
import mapRevertIcon from './map-revert.png';
import liveTrackIcon from './livetrack.png';
import { useCallback } from 'react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';
const iconUrl = mapIcon;

// Center point and radius configuration
const CENTER_POINT = {
  latitude: 33.6095571,
  longitude: -84.8039517
};
const MAX_RADIUS = 0.03; 
const BOUNDARY_COLOR = [255, 255, 255, 100]; 

const INITIAL_VIEW_STATE = {
  latitude: CENTER_POINT.latitude,
  longitude: CENTER_POINT.longitude,
  zoom: 3,
  pitch: 60,
  bearing: -30,
  maxZoom: 20,
  minZoom: 1
};


function App() {
  const [hoverInfo, setHoverInfo] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const deckRef = useRef();
  const [selectedId, setSelectedId] = useState(null);
  const pendingIdRef = useRef(null);
  const mouseInfluenceRef = useRef({ x: 0, y: 0 });
  
  const [isInWheelMode, setIsInWheelMode] = useState(false);
  const wheelModeProgressRef = useRef(0); // 0 = default view (zoomed in), 1 = scrolled-out view
  const wheelModeTargetProgressRef = useRef(0);

  const isPinchingRef = useRef(false);
  const initialPinchDistanceRef = useRef(null);
  
  const [isAnimationLocked, setIsAnimationLocked] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const loadingTimeoutRef = useRef();

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragPrevRef = useRef({ x: 0, y: 0 });
  const [isPinTransition, setIsPinTransition] = useState(false);

  const [pitchSmoothness, setPitchSmoothness] = useState(0.05);

  const [selectedPin, setSelectedPin] = useState(null);

  // Enhanced camera state management
  const targetViewRef = useRef({ pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing });
  const animationFrameRef = useRef();
  const prevViewStateRef = useRef(null);
  const isDraggingRef = useRef(false);
  const leftDragVelocityRef = useRef({ bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 });

  const [ambientMovementEnabled, setAmbientMovementEnabled] = useState(true);
  const ambientInfluenceRef = useRef({ x: 0, y: 0 });
  
  // Enhanced floating movement
  const floatingVelocityRef = useRef({ x: 0, y: 0 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const lastMouseTimeRef = useRef(Date.now());

  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchPrevRef = useRef({ x: 0, y: 0 });
  const isTouchDraggingRef = useRef(false);
  const touchCountRef = useRef(0);

  const targetPositionRef = useRef({
    latitude: INITIAL_VIEW_STATE.latitude,
    longitude: INITIAL_VIEW_STATE.longitude,
    zoom: INITIAL_VIEW_STATE.zoom
  });

  // Add base zoom reference for floating effect
  const baseZoomRef = useRef(INITIAL_VIEW_STATE.zoom);
  const tempZoomOffsetRef = useRef(0);
  const isZoomDraggingRef = useRef(false);

  const canvasRef = useRef(); // Line ~41 - Canvas never used
  const wrapperRef = useRef(); 
  // Add flag to track if we should stay at pin position
  const shouldStayAtPinPositionRef = useRef(false);

  const [isAtSmoothDragZoom, setIsAtSmoothDragZoom] = useState(false);
  const SMOOTH_DRAG_ZOOM_LEVEL = 16; // The zoom level where smooth drag is enabled

  const [smoothnessSettings, setSmoothnessSettings] = useState({
    // Enhanced floating movement settings
    floatingStrength: 0.03,
    floatingDamping: 0.98,
    floatingMaxInfluence: 15,
    mouseVelocityInfluence: 0.01,
    
    // Enhanced drag settings
    leftDampingFactor: isMobile ? 0.85 : 0.92,
    leftDragBearingSensitivity: isMobile ? 0.20 : 0.10,
    leftSmoothFactor: 0.08,
    dragLerpFactor: 0.02,
    
    // Enhanced zoom settings - Much smaller values for floating effect
    verticalZoomSensitivity: 0.001,
    zoomFloatRange: 1,
    zoomReturnSpeed: 0.1,
    zoomReturnDamping: 0.85,
    zoomReturnCurve: 2.0,
    zoomDamping: 0.88,
    minZoom: 11,
    maxZoom: 16,

    // Enhanced ambient settings
    ambientStrength: 0.02,
    ambientMaxPitch: 0.1,
    ambientMaxBearing: 0.2,
    ambientSmoothness: 0.98,
    ambientMaxLatOffset: 0.0008,
    ambientMaxLngOffset: 0.0008,
    forwardMovementSpeed: isMobile ? 0.08 :0.06,
    forwardMovementDamping: 0.94,
    
    // Smoothness enhancement
    globalSmoothness: 0.85,
    stopThreshold: 0.001,

    // Boundary settings
    boundaryBounceFactor: 0.3,
    boundaryResistance: 0.8,

    dynamicPitchEnabled: true,
    minPitchValue: 63,    // Minimum pitch when fully zoomed out
    maxPitchValue: 67,   // Maximum pitch when fully zoomed in
    pitchZoomThresholdLow: 11,  // Zoom level where pitch starts decreasing
    pitchZoomThresholdHigh: 14,
  });

  // Helper function to clamp position to radius
  const clampToRadius = (lat, lng) => {
  const latDiff = lat - CENTER_POINT.latitude;
  const lngDiff = (lng - CENTER_POINT.longitude) * Math.cos(CENTER_POINT.latitude * Math.PI / 180);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  
  if (distance <= MAX_RADIUS) {
    return { 
      latitude: lat, 
      longitude: lng,
      isAtBoundary: false
    };
  }
  
  // Instead of bounce effect, clamp exactly to the boundary
  const angle = Math.atan2(lngDiff, latDiff);
  return {
    latitude: CENTER_POINT.latitude + MAX_RADIUS * Math.cos(angle),
    longitude: CENTER_POINT.longitude + (MAX_RADIUS * Math.sin(angle)) / Math.cos(CENTER_POINT.latitude * Math.PI / 180),
    isAtBoundary: true
  };
};

  // Clamp velocity to prevent sudden jumps
  const clampVelocity = (velocity, maxValue) => {
    return Math.max(-maxValue, Math.min(maxValue, velocity));
  };

  // Enhanced interpolation with momentum preservation
  const smoothInterpolate = (current, target, factor, momentum = 0) => {
    const diff = target - current;
    const newValue = current + diff * factor + momentum;
    return newValue;
  };

    // Update in the playInitialZoom function
  const playInitialZoom = (duration) => {
    const finalDuration = duration ?? 5000;
    setSelectedId(null);
    setHoverInfo(null);
    setIsPinTransition(false);
    shouldStayAtPinPositionRef.current = false;

    // Set initial zoom to the smooth drag zoom level
    baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL;
    tempZoomOffsetRef.current = 0;
    isZoomDraggingRef.current = false;
    setIsAtSmoothDragZoom(true);

    targetPositionRef.current = {
      latitude: CENTER_POINT.latitude,
      longitude: CENTER_POINT.longitude,
      zoom: SMOOTH_DRAG_ZOOM_LEVEL
    };
    targetViewRef.current = {
      pitch: INITIAL_VIEW_STATE.pitch,
      bearing: INITIAL_VIEW_STATE.bearing
    };
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };

    setViewState(prev => ({
      ...prev,
      longitude: CENTER_POINT.longitude,
      latitude: CENTER_POINT.latitude,
      zoom: SMOOTH_DRAG_ZOOM_LEVEL,
      pitch: 60,
      bearing: -20,
      transitionDuration: finalDuration,
      transitionInterpolator: new FlyToInterpolator()
    }));
  };

useEffect(() => {
    const handleWheel = (e) => {
        // Don't trigger the scroll animation if a pin is selected and the camera is locked
        if (shouldStayAtPinPositionRef.current) {
            return;
        }

        // The first scroll action activates the mode
        if (!isInWheelMode) {
            setIsInWheelMode(true);
            // Kill any existing momentum from drag/inertia to prevent conflicts
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
        }

        // Adjust the target progress. e.deltaY is positive for scroll down/out.
        // The sensitivity (0.0015) can be tuned for faster or slower scrolling.
        const scrollAmount = e.deltaY * 0.0015;
        wheelModeTargetProgressRef.current = Math.max(0, Math.min(1, wheelModeTargetProgressRef.current + scrollAmount));
        
        // Prevent the browser's default scroll behavior (like scrolling the page)
        e.preventDefault();
    };

    const container = wrapperRef.current;
    if (container) {
        // We use { passive: false } to allow e.preventDefault()
        container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
        if (container) {
            container.removeEventListener('wheel', handleWheel);
        }
    };
}, [isInWheelMode]); 

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      playInitialZoom();
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
  if (selectedPin && deckRef.current && deckRef.current.deck) {
    const updateTooltipPosition = () => {
      const viewports = deckRef.current.deck.getViewports();
      if (viewports && viewports.length > 0) {
        const viewport = viewports[0];
        const [x, y] = viewport.project([selectedPin.longitude, selectedPin.latitude]);
        setTooltipPos({ x, y });
      }
    };

    updateTooltipPosition();

    // Add event listener for viewstate changes
    const deckCanvas = deckRef.current.deck.canvas;
    deckCanvas.addEventListener('deck.gl.viewState', updateTooltipPosition);

    return () => {
      deckCanvas.removeEventListener('deck.gl.viewState', updateTooltipPosition);
    };
  } else {
    setTooltipPos(null);
  }
}, [selectedPin, viewState]);

    // Enhanced smooth camera updates with radius restriction
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
              const END_ZOOM = isMobile ? 12.5 : 13.5; 
              const START_PITCH = 60;
              const END_PITCH = 0;

              const lerp = (a, b, t) => a * (1 - t) + b * t;
              const newZoom = lerp(START_ZOOM, END_ZOOM, wheelModeProgressRef.current);
              const newPitch = lerp(START_PITCH, END_PITCH, wheelModeProgressRef.current);

              if (wheelModeProgressRef.current < 0.01 && wheelModeTargetProgressRef.current === 0) {
                setIsInWheelMode(false); 
                return {
                  ...prev,
                  zoom: START_ZOOM,
                  pitch: START_PITCH,
                  transitionDuration: 0,
                };
              }

              return {
                ...prev,
                zoom: newZoom,
                pitch: newPitch,
                transitionDuration: 0,
              };
            }

            // --- ALL PREVIOUS LOGIC RUNS ONLY IF NOT IN WHEEL MODE ---
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

            if (isDraggingRef.current) {
              shouldStayAtPinPositionRef.current = false;
              newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, smoothnessSettings.dragLerpFactor);
              // THIS IS THE CORRECTED LINE:
              newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, smoothnessSettings.dragLerpFactor);
              newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, smoothnessSettings.dragLerpFactor);
              newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, smoothnessSettings.dragLerpFactor);
              if (isZoomDraggingRef.current) {
                const targetZoom = baseZoomRef.current + tempZoomOffsetRef.current;
                newZoom = smoothInterpolate(currentZoom, targetZoom, smoothnessSettings.dragLerpFactor);
              } else {
                newZoom = smoothInterpolate(currentZoom, targetPositionRef.current.zoom, smoothnessSettings.dragLerpFactor);
              }
              const clamped = clampToRadius(newLatitude, newLongitude);
              newLatitude = clamped.latitude;
              newLongitude = clamped.longitude;
              if (clamped.isAtBoundary) {
                leftDragVelocityRef.current.latitude *= smoothnessSettings.boundaryResistance;
                leftDragVelocityRef.current.longitude *= smoothnessSettings.boundaryResistance;
              }
            } else {
              // ... (rest of the logic remains unchanged)
              if (Math.abs(leftDragVelocityRef.current.bearing) > smoothnessSettings.stopThreshold ||
                  Math.abs(leftDragVelocityRef.current.pitch) > smoothnessSettings.stopThreshold ||
                  Math.abs(leftDragVelocityRef.current.latitude) > smoothnessSettings.stopThreshold ||
                  Math.abs(leftDragVelocityRef.current.longitude) > smoothnessSettings.stopThreshold ||
                  Math.abs(leftDragVelocityRef.current.zoom) > smoothnessSettings.stopThreshold) {
                
                newBearing = currentBearing + leftDragVelocityRef.current.bearing;
                newPitch = Math.max(0, Math.min(67, currentPitch + leftDragVelocityRef.current.pitch));
                let tempLat = currentLatitude + leftDragVelocityRef.current.latitude;
                let tempLng = currentLongitude + leftDragVelocityRef.current.longitude;
                const clamped = clampToRadius(tempLat, tempLng);
                newLatitude = clamped.latitude;
                newLongitude = clamped.longitude;
                if (clamped.isAtBoundary) {
                  leftDragVelocityRef.current.latitude *= smoothnessSettings.boundaryResistance;
                  leftDragVelocityRef.current.longitude *= smoothnessSettings.boundaryResistance;
                }
                if (!shouldStayAtPinPositionRef.current) {
                  newZoom = currentZoom + leftDragVelocityRef.current.zoom;
                  const zoomDiff = SMOOTH_DRAG_ZOOM_LEVEL - newZoom;
                  if (Math.abs(zoomDiff) < 0.05) {
                    newZoom = 14;
                    leftDragVelocityRef.current.zoom = 0;
                    tempZoomOffsetRef.current = 0;
                    baseZoomRef.current = 14;
                  } else {
                    leftDragVelocityRef.current.zoom *= smoothnessSettings.zoomDamping;
                    leftDragVelocityRef.current.zoom += zoomDiff * 0.02;
                  }
                } else {
                  newZoom = currentZoom;
                  leftDragVelocityRef.current.zoom = 0;
                }
                leftDragVelocityRef.current = {
                  bearing: leftDragVelocityRef.current.bearing * smoothnessSettings.leftDampingFactor,
                  pitch: leftDragVelocityRef.current.pitch * smoothnessSettings.leftDampingFactor,
                  latitude: leftDragVelocityRef.current.latitude * smoothnessSettings.leftDampingFactor,
                  longitude: leftDragVelocityRef.current.longitude * smoothnessSettings.leftDampingFactor,
                  zoom: leftDragVelocityRef.current.zoom
                };
                targetViewRef.current = { pitch: newPitch, bearing: newBearing };
                targetPositionRef.current = { latitude: newLatitude, longitude: newLongitude, zoom: newZoom };
              } else if (ambientMovementEnabled && !isPinTransition) {
                const basePitch = targetViewRef.current.pitch;
                const baseBearing = targetViewRef.current.bearing;
                const baseLatitude = targetPositionRef.current.latitude;
                const baseLongitude = targetPositionRef.current.longitude;
                const mouseInfluenceX = mouseInfluenceRef.current.x + mouseVelocityRef.current.x * smoothnessSettings.mouseVelocityInfluence;
                const mouseInfluenceY = mouseInfluenceRef.current.y + mouseVelocityRef.current.y * smoothnessSettings.mouseVelocityInfluence;
                const pitchInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxPitch;
                const bearingInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxBearing;
                const latInfluence = mouseInfluenceY * smoothnessSettings.ambientMaxLatOffset;
                const lngInfluence = mouseInfluenceX * smoothnessSettings.ambientMaxLngOffset;
                floatingVelocityRef.current.x += mouseInfluenceX * smoothnessSettings.floatingStrength;
                floatingVelocityRef.current.y += mouseInfluenceY * smoothnessSettings.floatingStrength;
                floatingVelocityRef.current.x = clampVelocity(floatingVelocityRef.current.x, smoothnessSettings.floatingMaxInfluence);
                floatingVelocityRef.current.y = clampVelocity(floatingVelocityRef.current.y, smoothnessSettings.floatingMaxInfluence);
                const ambientTargetPitch = Math.max(0, Math.min(85, basePitch + pitchInfluence + floatingVelocityRef.current.y));
                const ambientTargetBearing = baseBearing + bearingInfluence + floatingVelocityRef.current.x;
                let ambientTargetLatitude = baseLatitude + latInfluence + floatingVelocityRef.current.y * 0.001;
                let ambientTargetLongitude = baseLongitude + lngInfluence + floatingVelocityRef.current.x * 0.001;
                const clamped = clampToRadius(ambientTargetLatitude, ambientTargetLongitude);
                ambientTargetLatitude = clamped.latitude;
                ambientTargetLongitude = clamped.longitude;
                floatingVelocityRef.current.x *= smoothnessSettings.floatingDamping;
                floatingVelocityRef.current.y *= smoothnessSettings.floatingDamping;
                const smoothFactor = 1 - smoothnessSettings.ambientSmoothness;
                newPitch = currentPitch + (ambientTargetPitch - currentPitch) * smoothFactor;
                newBearing = currentBearing + (ambientTargetBearing - currentBearing) * smoothFactor;
                newLatitude = currentLatitude + (ambientTargetLatitude - currentLatitude) * smoothFactor;
                newLongitude = currentLongitude + (ambientTargetLongitude - currentLongitude) * smoothFactor;
                newZoom = baseZoomRef.current;
                tempZoomOffsetRef.current = 0;
              } else {
                const smoothFactor = smoothnessSettings.leftSmoothFactor;
                newPitch = currentPitch + (targetViewRef.current.pitch - currentPitch) * smoothFactor;
                newBearing = currentBearing + (targetViewRef.current.bearing - currentBearing) * smoothFactor;
                let targetLat = currentLatitude + (targetPositionRef.current.latitude - currentLatitude) * smoothFactor;
                let targetLng = currentLongitude + (targetPositionRef.current.longitude - currentLongitude) * smoothFactor;
                const clamped = clampToRadius(targetLat, targetLng);
                newLatitude = clamped.latitude;
                newLongitude = clamped.longitude;
                newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * smoothFactor;
                if (!isDraggingRef.current && Math.abs(newZoom - targetPositionRef.current.zoom) < 0.1) {
                  baseZoomRef.current = targetPositionRef.current.zoom;
                }
              }
            }
            if (!shouldStayAtPinPositionRef.current) {
              newZoom = currentZoom + leftDragVelocityRef.current.zoom;
              const targetStableZoom = SMOOTH_DRAG_ZOOM_LEVEL;
              const zoomDiffToStable = targetStableZoom - newZoom;
              const snapThreshold = 0.08; 
              const nearStableZoom = Math.abs(zoomDiffToStable) < snapThreshold;
              const velocityLowOrCorrectDirection = 
                Math.abs(leftDragVelocityRef.current.zoom) < 0.01 || 
                (leftDragVelocityRef.current.zoom !== 0 && Math.sign(leftDragVelocityRef.current.zoom) === Math.sign(zoomDiffToStable));

              if (nearStableZoom && velocityLowOrCorrectDirection) {
                newZoom = targetStableZoom;
                leftDragVelocityRef.current.zoom = 0;
                tempZoomOffsetRef.current = 0;
                baseZoomRef.current = targetStableZoom; 
                if (!isAtSmoothDragZoom) {
                  setIsAtSmoothDragZoom(true);
                }
              } else {
                leftDragVelocityRef.current.zoom *= smoothnessSettings.zoomDamping;
                leftDragVelocityRef.current.zoom += zoomDiffToStable * 0.03;
                if (Math.abs(leftDragVelocityRef.current.zoom) < 0.0001) {
                  leftDragVelocityRef.current.zoom = 0;
                }
                if (isAtSmoothDragZoom) {
                  setIsAtSmoothDragZoom(false);
                }
              }
            } else {
              newZoom = currentZoom;
              if (baseZoomRef.current !== targetPositionRef.current.zoom) {
                baseZoomRef.current = targetPositionRef.current.zoom;
              }
              leftDragVelocityRef.current.zoom = 0;
            }
            
            newPitch = Math.max(0, Math.min(80, newPitch));
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
    }, [smoothnessSettings, ambientMovementEnabled, isInWheelMode, isPinTransition]);

    // Enhanced mouse event handling
    useEffect(() => {
      // Common drag movement logic (from your code)
      const handleDragMovement = (x, y, buttons) => {
          const prevX = isDraggingRef.current ? dragPrevRef.current.x : touchPrevRef.current.x;
          const prevY = isDraggingRef.current ? dragPrevRef.current.y : touchPrevRef.current.y;
          const deltaX = x - prevX;
          const deltaY = y - prevY;

          // VVVVVV NEW ADDITION: Hide tooltip on drag start VVVVVV
          if ((isDraggingRef.current || isTouchDraggingRef.current) && selectedPin) {
              // Check if movement from the initial drag/touch start point is significant
              // Use dragStartRef for mouse, touchStartRef for touch
              const startX = isDraggingRef.current ? dragStartRef.current.x : touchStartRef.current.x;
              const startY = isDraggingRef.current ? dragStartRef.current.y : touchStartRef.current.y;
              
              const movementX = Math.abs(x - startX);
              const movementY = Math.abs(y - startY);
              const dragStartThreshold = 3; // Small threshold to confirm drag initiation

              if (movementX > dragStartThreshold || movementY > dragStartThreshold) {
                  if (selectedPin) { // Double check selectedPin to avoid unnecessary calls
                      setSelectedPin(null); // Hide the tooltip
                      // Note: We are NOT setting selectedId to null here.
                      // That's handled in mouseup/touchend or by clicking another pin.
                  }
              }
          }
          // ^^^^^^ END OF NEW ADDITION ^^^^^^

          if (buttons === 2 && isDraggingRef.current) { // Right-click drag for pitch/bearing (mouse only)
            targetViewRef.current = {
              pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)),
              bearing: targetViewRef.current.bearing - deltaX * 0.35
            };
          } else if (buttons === 1) { // Left-click drag or touch for rotate, forward/backward, and floating zoom
            targetViewRef.current = {
              ...targetViewRef.current,
              bearing: targetViewRef.current.bearing - deltaX * smoothnessSettings.leftDragBearingSensitivity
            };

            isZoomDraggingRef.current = true;
            const zoomDelta = deltaY * smoothnessSettings.verticalZoomSensitivity;
            
            tempZoomOffsetRef.current += zoomDelta;
            tempZoomOffsetRef.current = Math.max(
              -smoothnessSettings.zoomFloatRange, 
              Math.min(smoothnessSettings.zoomFloatRange, tempZoomOffsetRef.current)
            );

            const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
            const zoomFactor = Math.pow(2, baseZoomRef.current); 
            const effectiveMoveSpeed = smoothnessSettings.forwardMovementSpeed / zoomFactor * 100;

            const moveDistance = deltaY * effectiveMoveSpeed * 0.5;

            const newLat = targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance;
            const newLng = targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance;
            
            const clamped = clampToRadius(newLat, newLng);
            
            targetPositionRef.current = {
              ...targetPositionRef.current, 
              latitude: clamped.latitude,
              longitude: clamped.longitude
            };
            
            if (clamped.isAtBoundary) {
              tempZoomOffsetRef.current *= 0.5;
            }
          }
          
          if (isDraggingRef.current) {
            dragPrevRef.current = { x, y };
          }
          if (isTouchDraggingRef.current) { 
              touchPrevRef.current = {x,y};
          }
      };

      // Common drag end logic (from your code, slightly adapted for clarity)
      const commonDragEndLogic = (isTouchEvent = false) => {
        if (prevViewStateRef.current && viewState) {
          const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
          // For pitch, only apply inertia if it was a mouse right-drag (not a zoom-drag or touch)
          const pitchDelta = (isDraggingRef.current && !isZoomDraggingRef.current && !isTouchEvent) ? (viewState.pitch - prevViewStateRef.current.pitch) : 0;
          const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
          const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
          
          const inertiaMultiplier = 1.2;
          let zoomVelocity = 0;

          if (!shouldStayAtPinPositionRef.current) { // Only apply zoom inertia if not supposed to stay at a pin
            const currentEffectiveZoom = baseZoomRef.current + tempZoomOffsetRef.current;
            const zoomDiffToStable = SMOOTH_DRAG_ZOOM_LEVEL - currentEffectiveZoom;

            if (Math.abs(zoomDiffToStable) > 0.01) {
                zoomVelocity = zoomDiffToStable * 0.05; // Adjust this factor for desired "pull back" strength
            }
          }
          
          leftDragVelocityRef.current = {
            bearing: clampVelocity(bearingDelta * inertiaMultiplier, 8),
            pitch: clampVelocity(pitchDelta * inertiaMultiplier, 5),
            latitude: clampVelocity(latDelta * inertiaMultiplier, 0.1),
            longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.1),
            zoom: clampVelocity(zoomVelocity, 0.3) // Clamp max zoom velocity
          };
        }
        
        // Reset drag state flags
        if (isTouchEvent) {
            isTouchDraggingRef.current = false;
        } else {
            isDraggingRef.current = false;
        }
        setIsDragging(false); // For cursor
        isZoomDraggingRef.current = false; // Reset this flag specifically
        tempZoomOffsetRef.current = 0; // Crucial to reset this
      };


      const handleMouseDown = (e) => {
        if (isInWheelMode) return;
  if (e.button === 0 || e.button === 2) { // Left or Right mouse button
    const { latitude, longitude, zoom, pitch, bearing } = viewState; // Capture current viewState

    // If a pin is currently selected, we prepare for it to *potentially* be deselected
    // or for the camera to move. We unlock the camera here.
    // The actual deselection will be handled by:
    // 1. IconLayer's onClick (if another pin is clicked)
    // 2. DeckGL's global onClick (if empty space is clicked)
    // 3. handleMouseUp (if this mousedown turns into a drag)
    if (selectedId) {
      shouldStayAtPinPositionRef.current = false; // Allow camera to move if this mousedown turns into a drag
    }
    // DO NOT call setSelectedId(null) or setSelectedPin(null) here.

    isDraggingRef.current = true;
    setIsDragging(true); // For cursor style
    dragStartRef.current = { x: e.clientX, y: e.clientY }; // Store mousedown position
    dragPrevRef.current = { x: e.clientX, y: e.clientY };
    
    // Reset velocities and ensure camera targets are based on current view
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };
    
    targetPositionRef.current = { latitude, longitude, zoom };
    targetViewRef.current = { pitch, bearing };
    baseZoomRef.current = zoom; // Use the current zoom as the base for this drag
    tempZoomOffsetRef.current = 0; // Reset temporary zoom offset

    // Determine if this drag (left-click) will control zoom/forward
    isZoomDraggingRef.current = (e.button === 0);
  }
};

      const handleMouseUp = (e) => {
  if ((e.button === 0 || e.button === 2) && isDraggingRef.current) {
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    const dragThreshold = 5; // Pixels: if moved less than this, it's considered a click, otherwise a drag

    // If a pin was selected AND this mouseup concludes a drag (moved beyond threshold)
    if (selectedId && (dx > dragThreshold || dy > dragThreshold)) {
        // Deselect the pin because the user initiated a drag action.
        // If it was a click on another pin, IconLayer's onClick would have already handled selection.
        // If it was a click on empty space, DeckGL's onClick will handle deselection.
        setSelectedId(null);
        setSelectedPin(null);
        if (hoverInfo) setHoverInfo(null);
        // shouldStayAtPinPositionRef.current was already set to false in handleMouseDown
    }
    // If it was a click (not a drag):
    // - Clicking another pin: IconLayer's onClick handles it.
    // - Clicking empty space: DeckGL's global onClick handles it.
    // So, no explicit deselection here for "clicks".

    commonDragEndLogic(false); // Pass false for isTouchEvent (handles inertia, resets drag flags)
  }
};

      const handleTouchStart = (e) => {
        if (isInWheelMode && e.touches.length === 1) {
          return; 
        }

        if (e.touches.length === 2) {
        isPinchingRef.current = true;
        // Prevent 1-finger drag logic from running
        isTouchDraggingRef.current = false; 

        // Calculate and store the initial distance between fingers
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        initialPinchDistanceRef.current = distance;

        // Enter the special animation mode
        if (!isInWheelMode) {
            setIsInWheelMode(true);
            // Kill any existing momentum
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
        }
        e.preventDefault();
        return; // Exit early
    }
        // if (isInWheelMode) return;
        if (e.touches.length === 1) {
          e.preventDefault(); // Prevent default touch actions like scrolling
          
          const { latitude, longitude, zoom, pitch, bearing } = viewState; // Capture current viewState

          // Similar to handleMouseDown, if a pin is selected, unlock the camera
          // for a potential drag. Actual deselection is deferred.
          if (selectedId) {
            shouldStayAtPinPositionRef.current = false;
          }
          // DO NOT call setSelectedId(null) or setSelectedPin(null) here.

          const touch = e.touches[0];
          isTouchDraggingRef.current = true;
          setIsDragging(true); // For visual feedback if needed
          touchStartRef.current = { x: touch.clientX, y: touch.clientY }; // Store touchstart position
          touchPrevRef.current = { x: touch.clientX, y: touch.clientY };
          // touchCountRef.current = e.touches.length; // Not actively used in the deselection logic path

          // Reset velocities and set targets
          leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          floatingVelocityRef.current = { x: 0, y: 0 };
          
          targetPositionRef.current = { latitude, longitude, zoom };
          targetViewRef.current = { pitch, bearing };
          baseZoomRef.current = zoom;
          tempZoomOffsetRef.current = 0;
          isZoomDraggingRef.current = true; // Touch drag always implies potential for zoom/forward
        }
      };

      const handleTouchEnd = (e) => {

        if (e.touches.length === 2 && isPinchingRef.current && initialPinchDistanceRef.current) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        
        // Calculate how much the distance has changed from the start
        const distanceDelta = currentDistance - initialPinchDistanceRef.current;
        
        // Use the change in distance to drive our animation progress.
        // A negative delta (pinch-in) should increase progress (zoom out).
        // A positive delta (pinch-out) should decrease progress (zoom in).
        const pinchSensitivity = 0.005; // Adjust for faster/slower response
        const progressDelta = distanceDelta * pinchSensitivity;

        // We subtract the progressDelta because a pinch-out (positive delta) should zoom IN (decrease progress)
        wheelModeTargetProgressRef.current = Math.max(0, Math.min(1, wheelModeTargetProgressRef.current - progressDelta));
        
        return; // Don't run the one-finger drag logic
    }
        // Ensure we are reacting to the end of the touch that started the drag
        // and that there are no more touches on the screen.
        if (isTouchDraggingRef.current && e.changedTouches.length > 0 && e.touches.length === 0) {
          const touch = e.changedTouches[0]; // Get info about the touch that was just lifted
          const dx = Math.abs(touch.clientX - touchStartRef.current.x);
          const dy = Math.abs(touch.clientY - touchStartRef.current.y);
          const dragThreshold = 10; // Touch might need a slightly larger threshold for distinguishing tap vs drag

          // If a pin was selected AND this touchend concludes a drag
          if (selectedId && (dx > dragThreshold || dy > dragThreshold)) {
              // Deselect the pin because the user initiated a drag.
              setSelectedId(null);
              setSelectedPin(null);
              if (hoverInfo) setHoverInfo(null);
              // shouldStayAtPinPositionRef.current was already set to false in handleTouchStart
          }
          // If it was a tap (not a drag):
          // - Tapping another pin: IconLayer's onClick handles it.
          // - Tapping empty space: DeckGL's global onClick handles it.

          commonDragEndLogic(true); // Pass true for isTouchEvent
        }
      };
      
      const handleMouseMoveForAmbient = (e) => { // Renamed to avoid conflict if main handleMouseMove is different
        if (ambientMovementEnabled && !isDraggingRef.current && !isTouchDraggingRef.current && !shouldStayAtPinPositionRef.current) {
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
            // The ambientInfluenceRef calculation for smoothing ambient effect should be in your smoothUpdate or a similar place if needed
        }
        // If dragging, the main handleDragMovement takes care of mouse position for drag.
        if (isDraggingRef.current) {
            handleDragMovement(e.clientX, e.clientY, e.buttons || 1);
        }
      };

      const handleTouchMoveForDrag = (e) => { // Renamed for clarity
          if (isTouchDraggingRef.current && e.touches.length === 1) {
              e.preventDefault(); // Prevent scrolling during touch drag
              const touch = e.touches[0];
              handleDragMovement(touch.clientX, touch.clientY, 1); // Simulate left mouse button for touch drag
          }
      };


      // Mouse events
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMoveForAmbient); // Use the specific one for ambient and drag
      
      // Touch events
      window.addEventListener('touchstart', handleTouchStart, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
      window.addEventListener('touchmove', handleTouchMoveForDrag, { passive: false }); // Use specific one for touch drag
      
      const preventDefaultContextMenu = (e) => e.preventDefault();
      window.addEventListener('contextmenu', preventDefaultContextMenu);

      return () => {
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMoveForAmbient);
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchmove', handleTouchMoveForDrag);
        window.removeEventListener('contextmenu', preventDefaultContextMenu);
      };
    // Key dependencies:
    // - viewState: to capture its current value at drag start.
    // - selectedId: to know if a pin needs unselecting.
    // - smoothnessSettings: for sensitivities used in handleDragMovement.
    // - ambientMovementEnabled, shouldStayAtPinPositionRef: for conditional logic in mousemove.
    // Note: Refs like targetPositionRef, isDraggingRef are mutated directly and don't need to be deps.
    }, [viewState, selectedId, hoverInfo, smoothnessSettings, ambientMovementEnabled, shouldStayAtPinPositionRef.current]); // Added hoverInfo
  

// I've included simplified versions based on your latest provided code.
    useEffect(() => {
  const handleMouseMove = (e) => {
    const x = e.clientX;
    const y = e.clientY;
    const currentTime = Date.now();
    
    // Calculate mouse velocity for enhanced floating effect
    const deltaTime = currentTime - lastMouseTimeRef.current;
    if (deltaTime > 0) {
      const deltaX = x - lastMousePosRef.current.x;
      const deltaY = y - lastMousePosRef.current.y;
      
      mouseVelocityRef.current.x = deltaX / deltaTime;
      mouseVelocityRef.current.y = deltaY / deltaTime;
      
      // Clamp velocity
      mouseVelocityRef.current.x = clampVelocity(mouseVelocityRef.current.x, 2);
      mouseVelocityRef.current.y = clampVelocity(mouseVelocityRef.current.y, 2);
    }
    
    lastMousePosRef.current = { x, y };
    lastMouseTimeRef.current = currentTime;
    
    if (ambientMovementEnabled && !isDraggingRef.current && !isTouchDraggingRef.current) {
      const { innerWidth, innerHeight } = window;
      const xNorm = (x / innerWidth) * 2 - 1;
      const yNorm = (y / innerHeight) * 2 - 1;
      
      mouseInfluenceRef.current = { x: xNorm, y: yNorm };
      
      // Enhanced ambient calculation with floating effect
      ambientInfluenceRef.current = {
        x: ambientInfluenceRef.current.x * smoothnessSettings.ambientSmoothness +
           mouseInfluenceRef.current.x * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness),
        y: ambientInfluenceRef.current.y * smoothnessSettings.ambientSmoothness +
           mouseInfluenceRef.current.y * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness)
      };
    }

    if (isDraggingRef.current) {
      handleDragMovement(x, y, e.buttons || 1); // Default to left mouse button
    }
  };

  // Touch move handler
  // Replace the existing touch move handler with this updated version
const handleTouchMove = (e) => {
  e.preventDefault();
  
  if (e.touches.length === 1 && isTouchDraggingRef.current) {
    const touch = e.touches[0];
    console.log('Touch Move:', { x: touch.clientX, y: touch.clientY });
    const x = touch.clientX;
    const y = touch.clientY;
    
    // Calculate delta from previous position
    const deltaX = x - touchPrevRef.current.x;
    const deltaY = y - touchPrevRef.current.y;
    
    // When touch dragging starts, disable pin position staying (same as mouse)
    shouldStayAtPinPositionRef.current = false;
    
    // Update target view and position
    targetViewRef.current = {
      ...targetViewRef.current,
      bearing: targetViewRef.current.bearing - deltaX * smoothnessSettings.leftDragBearingSensitivity
    };

    // Handle zoom/forward movement
    isZoomDraggingRef.current = true;
    const zoomDelta = deltaY * smoothnessSettings.verticalZoomSensitivity;
    tempZoomOffsetRef.current = Math.max(
      -smoothnessSettings.zoomFloatRange,
      Math.min(smoothnessSettings.zoomFloatRange, tempZoomOffsetRef.current + zoomDelta)
    );

    // Forward movement
    const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
    const zoomFactor = Math.pow(2, viewState.zoom);
    const effectiveMoveSpeed = smoothnessSettings.forwardMovementSpeed / zoomFactor * 100;
    const moveDistance = deltaY * effectiveMoveSpeed * 0.5;

    const newLat = targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance;
    const newLng = targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance;
    
    const clamped = clampToRadius(newLat, newLng);
    targetPositionRef.current = {
      ...targetPositionRef.current,
      latitude: clamped.latitude,
      longitude: clamped.longitude
    };

    touchPrevRef.current = { x, y };
  }
};


  // Common drag movement logic
  const handleDragMovement = (x, y, buttons) => {
    const deltaX = x - (isDraggingRef.current ? dragPrevRef.current.x : touchPrevRef.current.x);
    const deltaY = y - (isDraggingRef.current ? dragPrevRef.current.y : touchPrevRef.current.y);

    if (buttons === 2) { // Right-click drag for pitch/bearing (mouse only)
      targetViewRef.current = {
        pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)),
        bearing: targetViewRef.current.bearing - deltaX * 0.35
      };
    } else if (buttons === 1) { // Left-click drag or touch for rotate, forward/backward, and floating zoom
      // Horizontal movement controls rotation (bearing)
      targetViewRef.current = {
        ...targetViewRef.current,
        bearing: targetViewRef.current.bearing - deltaX * smoothnessSettings.leftDragBearingSensitivity
      };

      // Enhanced floating zoom control with vertical drag
      isZoomDraggingRef.current = true;
      const zoomDelta = deltaY * smoothnessSettings.verticalZoomSensitivity;
      
      // Update temporary zoom offset instead of actual zoom
      tempZoomOffsetRef.current += zoomDelta;
      
      // Clamp the offset to the float range
      tempZoomOffsetRef.current = Math.max(
        -smoothnessSettings.zoomFloatRange, 
        Math.min(smoothnessSettings.zoomFloatRange, tempZoomOffsetRef.current)
      );

      // Enhanced forward/backward movement based on bearing
      const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
      const zoomFactor = Math.pow(2, viewState.zoom); 
      const effectiveMoveSpeed = smoothnessSettings.forwardMovementSpeed / zoomFactor * 100;

      const moveDistance = deltaY * effectiveMoveSpeed * 0.5;

      // Calculate new position
      const newLat = targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance;
      const newLng = targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance;
      
      // Apply boundary check immediately
      const clamped = clampToRadius(newLat, newLng);
      
      // Only update if within bounds or apply the clamped values
      targetPositionRef.current = {
        ...targetPositionRef.current,
        latitude: clamped.latitude,
        longitude: clamped.longitude
      };
      
      // Add resistance when hitting boundary
      if (clamped.isAtBoundary) {
        // Reduce movement speed when at boundary
        tempZoomOffsetRef.current *= 0.5;
      }
    }
    
    if (isDraggingRef.current) {
      dragPrevRef.current = { x, y };
    }
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  
  return () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('touchmove', handleTouchMove);
  };
}, [smoothnessSettings, viewState.zoom, ambientMovementEnabled]);
  
    // Enhanced mouse event handling
    useEffect(() => {
  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 2) {
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragPrevRef.current = { x: e.clientX, y: e.clientY };
      leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
      floatingVelocityRef.current = { x: 0, y: 0 }; // Reset floating velocity on drag start
      
      // When dragging starts, disable pin position staying
      shouldStayAtPinPositionRef.current = false;
      
      // Preserve current zoom when starting drag
      if (e.button === 0) { // Left mouse button
        baseZoomRef.current = viewState.zoom; // Preserve current zoom
        tempZoomOffsetRef.current = 0;
        isZoomDraggingRef.current = false;
      }
    }
  };

  const handleMouseUp = (e) => {
    if ((e.button === 0 || e.button === 2) && isDraggingRef.current) {
      handleDragEnd();
    }
  };

  // Touch event handlers
  const handleTouchStart = (e) => {
  if (e.touches.length === 1) {
    e.preventDefault();
    
    const touch = e.touches[0];
    console.log('Touch Start:', { x: touch.clientX, y: touch.clientY });
    isTouchDraggingRef.current = true;
    setIsDragging(true);
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchPrevRef.current = { x: touch.clientX, y: touch.clientY };
    touchCountRef.current = e.touches.length;
    
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };
    
    // When touch dragging starts, disable pin position staying
    shouldStayAtPinPositionRef.current = false;
    
    baseZoomRef.current = viewState.zoom;
    tempZoomOffsetRef.current = 0;
    isZoomDraggingRef.current = false;
  }
};

  const handleTouchEnd = (e) => {
  if (isTouchDraggingRef.current && e.touches.length === 0) {
    // Calculate and apply inertia
    console.log('Touch End');
    if (prevViewStateRef.current && viewState) {
      const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
      const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
      const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
      
      // Check if we're at the smooth drag zoom level
      const isNearSmoothDragZoom = Math.abs(viewState.zoom - SMOOTH_DRAG_ZOOM_LEVEL) < 0.05;
      
      let zoomVelocity = 0;
      if (isNearSmoothDragZoom) {
        // At the smooth drag zoom level, enable smooth drag behavior
        baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL;
        // No zoom velocity - stay at this level
        zoomVelocity = 0;
      } else {
        // At other zoom levels, add velocity to return to the smooth drag zoom level
        baseZoomRef.current = viewState.zoom;
        const zoomDiff = SMOOTH_DRAG_ZOOM_LEVEL - viewState.zoom;
        zoomVelocity = zoomDiff * 0.05;
      }
      
      leftDragVelocityRef.current = {
        bearing: clampVelocity(bearingDelta * 1.2, 8),
        pitch: 0,
        latitude: clampVelocity(latDelta * 1.2, 0.1),
        longitude: clampVelocity(lngDelta * 1.2, 0.1),
        zoom: zoomVelocity
      };
    }
    
    isTouchDraggingRef.current = false;
    setIsDragging(false);
    isZoomDraggingRef.current = false;
    tempZoomOffsetRef.current = 0;

    // Update target references to current position (same as mouse drag end)
    targetPositionRef.current = {
      latitude: viewState.latitude,
      longitude: viewState.longitude,
      zoom: viewState.zoom
    };
    targetViewRef.current = {
      pitch: viewState.pitch,
      bearing: viewState.bearing,
    };
  }
};

  // Common drag end logic
  const handleDragEnd = () => {
    if (prevViewStateRef.current && viewState) {
      const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
      const pitchDelta = viewState.pitch - prevViewStateRef.current.pitch;
      const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
      const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
      
      const inertiaMultiplier = 1.2; // Increased for more momentum

      // Check if we're at the smooth drag zoom level
      const isNearSmoothDragZoom = Math.abs(viewState.zoom - SMOOTH_DRAG_ZOOM_LEVEL) < 0.05;
      
      if (isNearSmoothDragZoom) {
        // At the smooth drag zoom level, enable smooth drag behavior
        baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL;
        // No zoom velocity - stay at this level
        leftDragVelocityRef.current.zoom = 0;
      } else {
        // At other zoom levels, add velocity to return to the smooth drag zoom level
        baseZoomRef.current = viewState.zoom;
        const zoomDiff = SMOOTH_DRAG_ZOOM_LEVEL - viewState.zoom;
        leftDragVelocityRef.current.zoom = zoomDiff * 0.05;
      }
      
      // Clamp velocities to prevent sudden jumps
      leftDragVelocityRef.current = {
        bearing: clampVelocity(bearingDelta * inertiaMultiplier, 8),
        pitch: clampVelocity(pitchDelta * inertiaMultiplier, 5),
        latitude: clampVelocity(latDelta * inertiaMultiplier, 0.1),
        longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.1),
        zoom: leftDragVelocityRef.current.zoom
      };
    }
    
    isDraggingRef.current = false;
    setIsDragging(false);
    isZoomDraggingRef.current = false;

    tempZoomOffsetRef.current = 0;

    targetPositionRef.current = {
      latitude: viewState.latitude,
      longitude: viewState.longitude,
      zoom: viewState.zoom
    };
    targetViewRef.current = {
      pitch: viewState.pitch,
      bearing: viewState.bearing,
    };
  };

  // Mouse events
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  
  // Touch events
  window.addEventListener('touchstart', handleTouchStart, { passive: false });
  window.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  const preventDefaultContextMenu = (e) => e.preventDefault();
  window.addEventListener('contextmenu', preventDefaultContextMenu);

  return () => {
    window.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('contextmenu', preventDefaultContextMenu);
  };
}, [viewState, smoothnessSettings.leftDampingFactor]);
  
    useEffect(() => {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.getElementsByTagName('head')[0].appendChild(meta);
      }
    }, []);

  // Generate boundary circle path
  const generateBoundaryCircle = () => {
    return Array.from({ length: 360 }, (_, i) => {
      const angle = (i * Math.PI) / 180;
      return [
        CENTER_POINT.longitude + (MAX_RADIUS * Math.cos(angle) / Math.cos(CENTER_POINT.latitude * Math.PI / 180)),
        CENTER_POINT.latitude + MAX_RADIUS * Math.sin(angle)
      ];
    });
  };

  // Layers including boundary
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
   // Previous IconLayer configuration parts (id, data, getPosition, etc.) remain the same.
// Replace only the onClick method.

    new IconLayer({
      id: 'nationalParksIcons-' + selectedId, // Your existing dynamic ID
      data: NationalParksData.features,
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

      onClick: (info) => { // This handler is called only when a pickable object in this layer is clicked.
        if (info.object) {

          setIsPinTransition(true);

          setIsInWheelMode(false); // Force exit from the wheel/pinch animation mode.
          wheelModeProgressRef.current = 0; // Reset progress to the "zoomed-in" state.
          wheelModeTargetProgressRef.current = 0; // Reset target to prevent re-entry.

          isZoomDraggingRef.current = false;
          tempZoomOffsetRef.current = 0;
      
          const objectCoords = info.object.geometry.coordinates; 
          if (!objectCoords || objectCoords.length < 2) {
            console.error("Invalid coordinates for pin:", info.object);
            return;
          }
          const [longitude, latitude] = (Array.isArray(objectCoords[0]) && typeof objectCoords[0][0] === 'number') 
                                        ? objectCoords[0] 
                                        : objectCoords;
          
          const clickedId = info.object.id;      
          pendingIdRef.current = clickedId;

          setSelectedPin({ // For tooltip
            name: info.object.properties.Name,
            longitude,
            latitude
          });

          setIsLoading(true);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }

          // This setHoverInfo was in your original code. If it serves a purpose, keep it.
          // Otherwise, selectedPin might be sufficient for tooltip/hover-like display on click.
          setHoverInfo({
            name: info.object.properties.Name,
            longitude,
            latitude
          });

          shouldStayAtPinPositionRef.current = true; // Indicate that the view should lock onto the pin
          setIsPinTransition(true); // Signal that a pin-specific fly-to transition is active

          // Reset any ongoing camera momentum/velocity
          leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          floatingVelocityRef.current = { x: 0, y: 0 };

          const pinTargetZoom = 16;   // Desired zoom level for pin view
          const pinTargetPitch = 60;  // Desired pitch for pin view
          const pinTargetBearing = -20; // Consistent bearing for a "centered" pin view

          // Update target refs IMMEDIATELY. The smoothUpdate loop will use these
          // to maintain the view after the FlyToInterpolator finishes.
          targetPositionRef.current = {
            latitude: latitude,
            longitude: longitude,
            zoom: pinTargetZoom
          };
          targetViewRef.current = {
            pitch: pinTargetPitch,
            bearing: pinTargetBearing
          };

          setViewState(prev => ({
            ...prev, // Retain other viewState properties (e.g., width, height)
            longitude,
            latitude,
            zoom: pinTargetZoom, 
            pitch: pinTargetPitch,
            bearing: pinTargetBearing, // Crucially, fly to this specific bearing
            transitionDuration: 2000,
            transitionInterpolator: new FlyToInterpolator(),
            onTransitionEnd: () => {
              setSelectedId(pendingIdRef.current); // Finalize selection
              shouldStayAtPinPositionRef.current = true; // Reaffirm intention to stay at pin
              
              // Ensure target refs precisely match the state achieved by the transition.
              // This is critical for the smoothUpdate loop to correctly maintain the view.
              targetPositionRef.current = {
                  latitude: latitude,
                  longitude: longitude,
                  zoom: pinTargetZoom
              };
              targetViewRef.current = {
                  pitch: pinTargetPitch,
                  bearing: pinTargetBearing
              };
              baseZoomRef.current = pinTargetZoom; // Set base zoom for subsequent interactions
              
              loadingTimeoutRef.current = setTimeout(() => {
                setIsLoading(false);
                setIsPinTransition(false); // Pin fly-to transition is complete
              }, 500);
            }            
          }));
        }
      },
      onDrag: () => {
    // Disable zoom behavior during pin drag
    isZoomDraggingRef.current = false;
    tempZoomOffsetRef.current = 0;
  }
    })
  ].filter(Boolean);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        backgroundColor: '#1a1a2e'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: -1, pointerEvents: 'none'
        }}
      />
       <DeckGL
        ref={deckRef}
        viewState={viewState}
        controller={{
            dragPan: false, dragRotate: false, scrollZoom: false, touchZoom: false,
            touchRotate: false, doubleClickZoom: true, keyboard: false, inertia: false
        }}
        layers={layers}
        width="100%"
        height="100%"
        style={{ position: 'absolute', left: 0, top: 0 }}
        parameters={{
          clearColor: [0.05, 0.05, 0.05, 1.0] // Dark blue background [R, G, B, A]
        }}
        onViewStateChange={({ viewState: newDeckViewState, interactionState }) => {

          setViewState(newDeckViewState);
           if (!interactionState.inTransition && !isDraggingRef.current) {
             setViewState(newDeckViewState);
             targetPositionRef.current = {
                 latitude: newDeckViewState.latitude,
                 longitude: newDeckViewState.longitude,
                 zoom: newDeckViewState.zoom
             };
             targetViewRef.current = {
                 pitch: newDeckViewState.pitch,
                 bearing: newDeckViewState.bearing,
             };
           } else if (interactionState.inTransition) {
             setViewState(newDeckViewState);
           }
        }}
        // THIS IS THE RELEVANT PART FOR YOUR REQUEST:
        onClick={info => {
          if (!info.object) { // This condition is true if you click on empty map space
            setHoverInfo(null); // Clears hover info, if any
            setSelectedId(null); // Clears the ID of the selected pin
            setSelectedPin(null); // Clears the selected pin data (which hides the tooltip)
            shouldStayAtPinPositionRef.current = false; 
          }
          // If info.object *is* present, it means a pickable layer item was clicked.
          // In that case, the IconLayer's own onClick handler (which selects the pin)
          // would have been triggered.
        }}
        pickingRadius={30}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MapStyle}
          width="100%"
          height="100%"
          onLoad={() => setIsLoading(false)}
        />
      </DeckGL>

      <div className="smoothness-controls" style={{
        position: 'absolute', bottom: '80px', right: '20px', background: 'rgba(0,0,0,0.8)',
        padding: '15px', color: 'white', borderRadius: '8px', zIndex: 1000,
        maxWidth: '320px', fontSize: '12px', display: isMobile ? 'none' : 'block',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Enhanced Camera Controls</h4>
        
        {/* Floating Movement Controls */}
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffd700' }}>Floating Movement</h5>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Floating Strength: {smoothnessSettings.floatingStrength.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.01"
              value={smoothnessSettings.floatingStrength}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, floatingStrength: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Floating Damping: {smoothnessSettings.floatingDamping.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.85"
              max="0.98"
              step="0.01"
              value={smoothnessSettings.floatingDamping}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, floatingDamping: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Mouse Velocity Influence: {smoothnessSettings.mouseVelocityInfluence.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={smoothnessSettings.mouseVelocityInfluence}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, mouseVelocityInfluence: parseFloat(e.target.value) }))}
            />
          </div>
        </div>

        {/* Enhanced Drag Controls */}
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#87ceeb' }}>Drag Controls</h5>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Rotation Sensitivity: {smoothnessSettings.leftDragBearingSensitivity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.01"
              value={smoothnessSettings.leftDragBearingSensitivity}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, leftDragBearingSensitivity: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Drag Smoothness: {smoothnessSettings.dragLerpFactor.toFixed(2)}
            </label>
            <input type="range" min="0.05" max="0.3" step="0.01"
              value={smoothnessSettings.dragLerpFactor}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, dragLerpFactor: parseFloat(e.target.value) }))}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Inertia Damping: {smoothnessSettings.leftDampingFactor.toFixed(2)}
            </label>
            <input type="range" min="0.8" max="0.98" step="0.01"
              value={smoothnessSettings.leftDampingFactor}
              onChange={(e) => setSmoothnessSettings(s => ({ ...s, leftDampingFactor: parseFloat(e.target.value) }))}
            />
          </div>
        </div>
        {/* Forward Movement */}
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Forward Movement Speed: {smoothnessSettings.forwardMovementSpeed.toExponential(1)}
          </label>
          <input type="range" min="0.001" max="0.02" step="0.001"
            value={smoothnessSettings.forwardMovementSpeed}
            onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardMovementSpeed: parseFloat(e.target.value) }))}
          />
        </div>

        {/* Ambient Movement Toggle */}
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
            <input type="checkbox" checked={ambientMovementEnabled}
              onChange={(e) => setAmbientMovementEnabled(e.target.checked)} style={{marginRight: '8px'}}
            /> Enable Enhanced Ambient Movement
          </label>
        </div>

        {ambientMovementEnabled && (
          <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#dda0dd' }}>Ambient Settings</h5>
            <div style={{marginBottom: '6px'}}>
              <label>Ambient Strength: {smoothnessSettings.ambientStrength.toFixed(2)}</label>
              <input type="range" min="0.01" max="0.15" step="0.01" value={smoothnessSettings.ambientStrength}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientStrength: parseFloat(e.target.value) }))} />
            </div>
            <div style={{marginBottom: '6px'}}>
              <label>Max Pitch Effect: {smoothnessSettings.ambientMaxPitch.toFixed(0.1)}°</label>
              <input type="range" min="0.1" max="2" step="0.1" value={smoothnessSettings.ambientMaxPitch}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxPitch: parseFloat(e.target.value) }))} />
            </div>
            <div style={{marginBottom: '6px'}}>
              <label>Max Bearing Effect: {smoothnessSettings.ambientMaxBearing.toFixed(0.1)}°</label>
              <input type="range" min="0.1" max="3" step="0.1" value={smoothnessSettings.ambientMaxBearing}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxBearing: parseFloat(e.target.value) }))} />
            </div>
            <div style={{marginBottom: '6px'}}>
              <label>Ambient Smoothness: {smoothnessSettings.ambientSmoothness.toFixed(2)}</label>
              <input type="range" min="0.85" max="0.99" step="0.01" value={smoothnessSettings.ambientSmoothness}
                onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientSmoothness: parseFloat(e.target.value) }))} />
            </div>
          </div>
        )}

        {/* Manual Camera Controls */}
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffa500' }}>Manual Controls</h5>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Camera Pitch: {viewState.pitch.toFixed(1)}°
            </label>
            <input
              type="range"
              min="0"
              max="85"
              step="1"
              value={viewState.pitch}
              onChange={(e) => {
                const newPitch = parseFloat(e.target.value);
                setViewState(prev => ({ ...prev, pitch: newPitch }));
                targetViewRef.current.pitch = newPitch;
              }}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Camera Bearing: {viewState.bearing.toFixed(1)}°
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={viewState.bearing}
              onChange={(e) => {
                const newBearing = parseFloat(e.target.value);
                setViewState(prev => ({ ...prev, bearing: newBearing }));
                targetViewRef.current.bearing = newBearing;
              }}
            />
          </div>
          <div style={{marginBottom: '6px'}}>
            <label style={{display: 'block', marginBottom: '2px'}}>
              Zoom Level: {viewState.zoom.toFixed(1)}
            </label>
            <input
              type="range"
              min={smoothnessSettings.minZoom}
              max={smoothnessSettings.maxZoom}
              step="0.1"
              value={viewState.zoom}
              onChange={(e) => {
                const newZoom = parseFloat(e.target.value);
                setViewState(prev => ({ ...prev, zoom: newZoom }));
                targetPositionRef.current.zoom = newZoom;
              }}
            />
          </div>
        </div>

        {/* Global Settings */}
        <div style={{marginBottom: '8px'}}>
          <label style={{display: 'block', marginBottom: '2px'}}>
            Global Smoothness: {smoothnessSettings.globalSmoothness.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.7"
            max="0.95"
            step="0.05"
            value={smoothnessSettings.globalSmoothness}
            onChange={(e) => setSmoothnessSettings(s => ({ ...s, globalSmoothness: parseFloat(e.target.value) }))}
          />
        </div>

        {/* Add this to your smoothness-controls div, after the other control sections */}
<div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
  <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ff9966' }}>Dynamic Pitch Controls</h5>
  
  <div style={{marginBottom: '6px'}}>
    <label style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
      <input 
        type="checkbox" 
        checked={smoothnessSettings.dynamicPitchEnabled}
        onChange={(e) => setSmoothnessSettings(s => ({ 
          ...s, 
          dynamicPitchEnabled: e.target.checked 
        }))} 
        style={{marginRight: '8px'}}
      /> 
      Enable Dynamic Pitch
    </label>
  </div>
  <div style={{marginBottom: '6px'}}>
  <label style={{display: 'block', marginBottom: '2px'}}>
    Min Zoom Level (Flat View): {smoothnessSettings.pitchZoomThresholdLow.toFixed(1)}
  </label>
  <input
    type="range"
    min="1"
    max="13"
    step="0.5"
    value={smoothnessSettings.pitchZoomThresholdLow}
    onChange={(e) => setSmoothnessSettings(s => ({ 
      ...s, 
      pitchZoomThresholdLow: parseFloat(e.target.value) 
    }))}
  />
</div>

<div style={{marginBottom: '6px'}}>
  <label style={{display: 'block', marginBottom: '2px'}}>
    Min Pitch (at zoom {smoothnessSettings.pitchZoomThresholdLow.toFixed(1)} or less): {smoothnessSettings.minPitchValue.toFixed(0)}°
  </label>
  <input
    type="range"
    min="0"
    max="45"
    step="1"
    value={smoothnessSettings.minPitchValue}
    onChange={(e) => setSmoothnessSettings(s => ({ 
      ...s, 
      minPitchValue: parseFloat(e.target.value) 
    }))}
  />
</div>

<div style={{marginBottom: '6px'}}>
  <label style={{display: 'block', marginBottom: '2px'}}>
    Max Pitch (at zoom 14 or more): {smoothnessSettings.maxPitchValue.toFixed(0)}°
  </label>
  <input
    type="range"
    min="30"
    max="85"
    step="1"
    value={smoothnessSettings.maxPitchValue}
    onChange={(e) => setSmoothnessSettings(s => ({ 
      ...s, 
      maxPitchValue: parseFloat(e.target.value) 
    }))}
  />
</div>

<div style={{marginBottom: '6px'}}>
  <label style={{display: 'block', marginBottom: '2px'}}>
    Pitch Transition Speed: {(pitchSmoothness * 100).toFixed(0)}%
  </label>
  <input
    type="range"
    min="0.01"
    max="0.2"
    step="0.01"
    value={pitchSmoothness}
    onChange={(e) => setPitchSmoothness(parseFloat(e.target.value))}
  />
</div>
  
</div>

        {/* Reset Button */}
        <button 
          onClick={() => setSmoothnessSettings({
            floatingStrength: 0.08,
            floatingDamping: 0.94,
            zoomReturnDamping: 0.92,
            floatingMaxInfluence: 15,
            mouseVelocityInfluence: 0.3,
            leftDampingFactor: 0.92,
            leftDragBearingSensitivity: 0.12,
            leftSmoothFactor: 0.08,
            dragLerpFactor: 0.12,
            verticalZoomSensitivity: 0.008,
            zoomDamping: 0.88,
            minZoom: 1,
            maxZoom: 18,
            ambientStrength: 0.06,
            ambientMaxPitch: 8,
            ambientMaxBearing: 12,
            ambientSmoothness: 0.96,
            ambientMaxLatOffset: 0.008,
            ambientMaxLngOffset: 0.008,
            forwardMovementSpeed: 0.006,
            forwardMovementDamping: 0.94,
            globalSmoothness: 0.85,
            stopThreshold: 0.001,
            dynamicPitchEnabled: true,
            minPitchValue: 0,
            maxPitchValue: 75,
            pitchZoomThresholdLow: 8,
            pitchZoomThresholdHigh: 14,
          })}
          style={{
            width: '100%',
            padding: '8px',
            background: '#444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Reset to Defaults
        </button>
      </div>
      {/* Tooltip with original styling and positioning */}
            {selectedPin && tooltipPos && ( <div className="tooltip tooltip-center-screen tooltip-visible tooltip-animate"> <strong>{selectedPin.name}</strong> <a href='#' target='_blank' rel="noopener noreferrer" style={{ color: '#fff', display: 'block' }}>Discover</a> </div> )}

      
      <div className='live-back-btns'>
        <ul>
          <li>
  <a 
    href="#" 
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation(); // Stop event bubbling
      
      // Force cleanup of all pin-related states
      setSelectedId(null);
      setSelectedPin(null);
      setHoverInfo(null);
      setTooltipPos(null);
      
      // Reset all camera-related refs
      shouldStayAtPinPositionRef.current = false;
      isDraggingRef.current = false;
      isTouchDraggingRef.current = false;
      
      // Reset any ongoing momentum
      leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
      floatingVelocityRef.current = { x: 0, y: 0 };
      
      // Add touch-specific handling
      if (isMobile) {
        setIsDragging(false);
        setIsPinTransition(false);
      }
      
      playInitialZoom(1000);
    }}
    onTouchEnd={(e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Same cleanup as onClick
      setSelectedId(null);
      setSelectedPin(null);
      setHoverInfo(null);
      setTooltipPos(null);
      
      shouldStayAtPinPositionRef.current = false;
      isDraggingRef.current = false;
      isTouchDraggingRef.current = false;
      
      leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
      floatingVelocityRef.current = { x: 0, y: 0 };
      
      setIsDragging(false);
      setIsPinTransition(false);
      
      playInitialZoom(1000);
    }}
  >
    <img 
      src={mapRevertIcon} 
      alt="Map"
      style={{
        pointerEvents: 'none', // Prevent img from interfering with touch events
        userSelect: 'none'
      }} 
    />
  </a>
</li>
          <li><a href="#" target='_blank'  rel="noopener noreferrer"><img src={liveTrackIcon} alt="Live Track" /></a></li>
        </ul>
      </div>

      <style>{`
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; position: fixed; }
        #root { width: 100%; height: 100%; overflow: hidden; position: fixed; }
        .live-back-btns { position: absolute; top: 20px; right: 20px; z-index: 9999; }
        .live-back-btns ul { display: flex; gap: 25px; margin: 0; padding: 0; list-style: none; }
        .smoothness-controls::-webkit-scrollbar { width: 6px; }
        .smoothness-controls::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
        .tooltip { background: rgba(0,0,0, 0.3); padding: 25px 35px; border-radius: 12px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4); opacity: 0; transition: opacity 0.3s ease-out, transform 0.3s ease-out; z-index: 1001; text-align: center; color: white; }
        .tooltip-center-screen { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95); width: 70vw; min-height: 150px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        .tooltip strong { font-size: 72px; line-height: 78px; display: block; margin-bottom: 15px; } .tooltip a { font-size: 18px; line-height: 22px; color: gold; text-decoration: none; padding: 8px 15px; border: 0.5px solid gold; border-radius: 5px; transition: background-color 0.2s, color 0.2s; } .tooltip a:hover { background-color: gold; color: black; }
        .tooltip-visible { opacity: 1; } .tooltip-animate { animation: fadeInUpTooltipCentered 0.4s ease-out forwards; }
        @keyframes fadeInUpTooltipCentered { 0% { opacity: 0; transform: translate(-50%, -45%) scale(0.95); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @media only screen and (max-width: 992px) { .tooltip-center-screen { width: 70vw; padding: 20px; } .tooltip strong { font-size: 46px; line-height: 60px; margin-bottom: 10px;} .tooltip a { font-size: 16px; line-height: 20px; } }
        @media only screen and (max-width: 767px) { .tooltip-center-screen { width: 80vw; max-width: 280px; padding: 15px; } .tooltip strong { font-size: 32px; line-height: 46px; margin-bottom: 8px;} .tooltip a { font-size: 14px; line-height: 18px; } }
      `}</style>
    </div>
  );
}

export default App;