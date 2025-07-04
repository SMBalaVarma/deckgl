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

// ==========================================================
// 1. IMPORT THE NEW HOOK
// ==========================================================
import useZoomPitchControl from './useZoomPitchControl';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';
const iconUrl = mapIcon;

// ... (rest of your constants)
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
  pitch: 65,
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
  const SMOOTH_DRAG_ZOOM_LEVEL = 15.5; // The zoom level where smooth drag is enabled

  const [smoothnessSettings, setSmoothnessSettings] = useState({
    // Enhanced floating movement settings
    floatingStrength: 0.03,
    floatingDamping: 0.98,
    floatingMaxInfluence: 15,
    mouseVelocityInfluence: 0.01,
    
    // Enhanced drag settings
    leftDampingFactor: 0.92,
    leftDragBearingSensitivity: 0.10,
    leftSmoothFactor: 0.08,
    dragLerpFactor: 0.02,
    
    // Enhanced zoom settings - Much smaller values for floating effect
    verticalZoomSensitivity: 0.001,
    zoomFloatRange: 1,
    zoomReturnSpeed: 0.1,
    zoomReturnDamping: 0.85,
    zoomReturnCurve: 2.0,
    zoomDamping: 0.88,
    minZoom: 1, // Set overall min/max zoom here
    maxZoom: 20,

    // Enhanced ambient settings
    ambientStrength: 0.02,
    ambientMaxPitch: 0.1,
    ambientMaxBearing: 0.2,
    ambientSmoothness: 0.98,
    ambientMaxLatOffset: 0.0004,
    ambientMaxLngOffset: 0.0004,
    forwardMovementSpeed: 0.06,
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

  // ==========================================================
  // 2. CALL THE HOOK WITH CORRECTED CONFIG
  // ==========================================================
  const isZoomPitchControlEnabled = !isPinTransition && !shouldStayAtPinPositionRef.current && !isDraggingRef.current;
  useZoomPitchControl({
    targetPositionRef,
    targetViewRef,
    enabled: isZoomPitchControlEnabled,
    config: {
      zoomSensitivity: 0.2, // A smaller value gives finer control
      pinchSensitivity: 0.005,
      minZoom: 13.0,
      maxZoom: 16.0,
      minPitch: 0,
      maxPitch: 60,
    }
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

    // Set initial zoom to a level where wheel control can take over
    const initialControlledZoom = 16.0;

    // ==========================================================
    // 3. UPDATE playInitialZoom TO START IN THE CORRECT STATE
    // ==========================================================
    targetPositionRef.current = {
      latitude: CENTER_POINT.latitude,
      longitude: CENTER_POINT.longitude,
      zoom: initialControlledZoom
    };
    targetViewRef.current = {
      pitch: 60, // Pitch should match the zoom level (60 at zoom 16)
      bearing: INITIAL_VIEW_STATE.bearing
    };

    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };

    setViewState(prev => ({
      ...prev,
      longitude: CENTER_POINT.longitude,
      latitude: CENTER_POINT.latitude,                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      
      zoom: initialControlledZoom,
      pitch: 60,
      bearing: -20,
      transitionDuration: finalDuration,
      transitionInterpolator: new FlyToInterpolator()
    }));
  };
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
          
          // Handle floating zoom effect during drag (this is for vertical drag, not wheel)
          const targetZoom = baseZoomRef.current + tempZoomOffsetRef.current;
          newZoom = smoothInterpolate(currentZoom, targetZoom, dragSmoothFactor);
          
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
          else if (ambientMovementEnabled && !isPinTransition) {
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
            
            // ==========================================================
            // 4. THE CRUCIAL FIX: Make zoom interpolate to its target
            //    instead of being reset.
            // ==========================================================
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
  }, [smoothnessSettings, ambientMovementEnabled, isAtSmoothDragZoom]);


  // ====================================================================================
  // START OF CONSOLIDATED EVENT HANDLER HOOK
  // This single useEffect replaces the three separate, conflicting ones from your code.
  // ====================================================================================
  useEffect(() => {
    // This function handles the actual movement logic for both mouse and touch drags
    const handleDragMovement = (x, y, buttons) => {
        const prevX = isDraggingRef.current ? dragPrevRef.current.x : touchPrevRef.current.x;
        const prevY = isDraggingRef.current ? dragPrevRef.current.y : touchPrevRef.current.y;
        const deltaX = x - prevX;
        const deltaY = y - prevY;

        // Hide tooltip on significant drag
        if ((isDraggingRef.current || isTouchDraggingRef.current) && selectedPin) {
            const startX = isDraggingRef.current ? dragStartRef.current.x : touchStartRef.current.x;
            const startY = isDraggingRef.current ? dragStartRef.current.y : touchStartRef.current.y;
            const dragStartThreshold = 5;
            if (Math.abs(x - startX) > dragStartThreshold || Math.abs(y - startY) > dragStartThreshold) {
                setSelectedPin(null);
            }
        }

        // Right-click drag for pitch/bearing (mouse only)
        if (buttons === 2 && isDraggingRef.current) {
            targetViewRef.current = {
                pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)),
                bearing: targetViewRef.current.bearing - deltaX * 0.35
            };
        } 
        // Left-click drag or touch drag
        else if (buttons === 1) { 
            targetViewRef.current = {
                ...targetViewRef.current,
                bearing: targetViewRef.current.bearing - deltaX * smoothnessSettings.leftDragBearingSensitivity
            };

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
        }

        if (isDraggingRef.current) dragPrevRef.current = { x, y };
        if (isTouchDraggingRef.current) touchPrevRef.current = { x, y };
    };

    // This function handles the logic for when a drag ends, for both mouse and touch
    const commonDragEndLogic = () => {
        if (prevViewStateRef.current && viewState) {
            const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
            const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
            const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;
            const pitchDelta = viewState.pitch - prevViewStateRef.current.pitch;

            const inertiaMultiplier = 1.2;

            // Apply inertia only if the drag was fast enough (a "flick")
            const velocityThreshold = 0.05; // Adjust this threshold as needed
            const totalVelocity = Math.abs(bearingDelta) + Math.abs(latDelta) * 100 + Math.abs(lngDelta) * 100;

            if (totalVelocity > velocityThreshold) {
                leftDragVelocityRef.current = {
                    bearing: clampVelocity(bearingDelta * inertiaMultiplier, 8),
                    pitch: clampVelocity(pitchDelta * inertiaMultiplier, 5),
                    latitude: clampVelocity(latDelta * inertiaMultiplier, 0.1),
                    longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.1),
                    zoom: 0
                };
            }
        }

        // Reset all drag-related state flags
        isDraggingRef.current = false;
        isTouchDraggingRef.current = false;
        setIsDragging(false); // For cursor style
        isZoomDraggingRef.current = false;
        tempZoomOffsetRef.current = 0;
    };

    // --- MOUSE EVENT HANDLERS ---
    const handleMouseDown = (e) => {
        if (e.button === 0 || e.button === 2) {
            const { latitude, longitude, zoom, pitch, bearing } = viewState;
            if (selectedId) {
                shouldStayAtPinPositionRef.current = false;
            }
            isDraggingRef.current = true;
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            dragPrevRef.current = { x: e.clientX, y: e.clientY };
            
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
            
            targetPositionRef.current = { latitude, longitude, zoom: targetPositionRef.current.zoom };
            targetViewRef.current = { pitch: targetViewRef.current.pitch, bearing };
            baseZoomRef.current = zoom;
        }
    };

    const handleMouseUp = (e) => {
        if ((e.button === 0 || e.button === 2) && isDraggingRef.current) {
            const dx = Math.abs(e.clientX - dragStartRef.current.x);
            const dy = Math.abs(e.clientY - dragStartRef.current.y);
            const dragThreshold = 5;

            if (selectedId && (dx > dragThreshold || dy > dragThreshold)) {
                setSelectedId(null);
                setSelectedPin(null);
                if (hoverInfo) setHoverInfo(null);
            }
            commonDragEndLogic();
        }
    };

    const handleMouseMove = (e) => {
        if (isDraggingRef.current) {
            handleDragMovement(e.clientX, e.clientY, e.buttons);
        } else if (ambientMovementEnabled && !shouldStayAtPinPositionRef.current) {
            const { innerWidth, innerHeight } = window;
            const xNorm = (e.clientX / innerWidth) * 2 - 1;
            const yNorm = (e.clientY / innerHeight) * 2 - 1;
            mouseInfluenceRef.current = { x: xNorm, y: yNorm };
        }
    };
    
    // --- TOUCH EVENT HANDLERS ---
    const handleTouchStart = (e) => {
//       const target = e.target;
//     if (target.closest('a, button, input')) {
//       return; // Ignore touches on UI elements
//     }
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const { latitude, longitude, zoom, pitch, bearing } = viewState;
            if (selectedId) {
                shouldStayAtPinPositionRef.current = false;
            }

            isTouchDraggingRef.current = true;
            setIsDragging(true);
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            touchPrevRef.current = { x: touch.clientX, y: touch.clientY };

            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
            
            targetPositionRef.current = { latitude, longitude, zoom: targetPositionRef.current.zoom };
            targetViewRef.current = { pitch: targetViewRef.current.pitch, bearing };
            baseZoomRef.current = zoom;
        }
    };

    const handleTouchEnd = (e) => {
        if (isTouchDraggingRef.current && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartRef.current.x);
            const dy = Math.abs(touch.clientY - touchStartRef.current.y);
            const dragThreshold = 10;

            if (selectedId && (dx > dragThreshold || dy > dragThreshold)) {
                setSelectedId(null);
                setSelectedPin(null);
                if (hoverInfo) setHoverInfo(null);
            }
            // THIS IS THE CRITICAL FIX: We simply call the common end logic.
            // It will handle resetting flags and calculating proper inertia.
            commonDragEndLogic();
        }
    };

    const handleTouchMove = (e) => {
        if (isTouchDraggingRef.current && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            // Simulate left-click button (1) for touch drag
            handleDragMovement(touch.clientX, touch.clientY, 1);
        }
    };

    // --- ATTACH AND CLEAN UP LISTENERS ---
    const el = window;
    const preventDefaultContextMenu = (e) => e.preventDefault();

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('contextmenu', preventDefaultContextMenu);

    return () => {
        el.removeEventListener('mousedown', handleMouseDown);
        el.removeEventListener('mouseup', handleMouseUp);
        el.removeEventListener('mousemove', handleMouseMove);
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchend', handleTouchEnd);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('contextmenu', preventDefaultContextMenu);
    };

  }, [viewState, selectedId, hoverInfo, smoothnessSettings, ambientMovementEnabled]);
  // ====================================================================================
  // END OF CONSOLIDATED EVENT HANDLER HOOK
  // ====================================================================================

  
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
          const objectCoords = info.object.geometry.coordinates; 
          if (!objectCoords || objectCoords.length < 2) {
            console.error("Invalid coordinates for pin:", info.object);
            return;
          }
          // Ensure longitude and latitude are correctly extracted
          // This handles GeoJSON Point (coords = [lng, lat]) 
          // and the first point of a MultiPoint (coords = [[lng, lat], ...])
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
          const pinTargetPitch = 65;  // Desired pitch for pin view
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
           if (!interactionState.inTransition && !isDraggingRef.current && !isTouchDraggingRef.current) {
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
            // playInitialZoom(1000); // Go back to the default wheel-controlled view
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
          <li><a href="#" onClick={(e) => {
            e.preventDefault();
            setSelectedId(null);  // Clear selected pin
        setSelectedPin(null); // Clear selected pin data
        setHoverInfo(null); 
            playInitialZoom(1000);
          }}><img src={mapRevertIcon} alt="Map" /></a>
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