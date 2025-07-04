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

  const [isMapLoaded, setIsMapLoaded] = useState(false);

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

  const isAnimationLockedRef = useRef(false);

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

  const canvasRef = useRef(); 

  const wrapperRef = useRef();
  // Add flag to track if we should stay at pin position
  const shouldStayAtPinPositionRef = useRef(false);

  const [isAtSmoothDragZoom, setIsAtSmoothDragZoom] = useState(false);

  const isManualZoomRef = useRef(false);

  const SMOOTH_DRAG_ZOOM_LEVEL = 16; // The zoom level where smooth drag is enabled

  const [smoothnessSettings, setSmoothnessSettings] = useState({
    // Enhanced floating movement settings
    floatingStrength: 0.03,
    floatingDamping: 0.98,

    floatingMaxInfluence: 15,
    mouseVelocityInfluence: 0.01,

    rotationSpeedMinZoom: 13.5, // The zoom level where rotation is slowest
    rotationSpeedMaxZoom: 16, // The zoom level where rotation is fastest
    rotationSpeedAtMinZoom: isMobile ? 0.09 : 0.08, // SLOW rotation when zoomed OUT
    rotationSpeedAtMaxZoom: isMobile ? 0.15 : 0.12, // FAST rotation when zoomed IN

    // Enhanced drag settings
    leftDampingFactor: isMobile ? 0.90 : 0.98,
    leftDragBearingSensitivity: isMobile ? 0.15 : 0.10,

    leftSmoothFactor: 0.08,
    dragLerpFactor: 0.08,

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
    ambientMaxPitch: 0.01,

    ambientMaxBearing: 0.02,
    ambientSmoothness: 0.98,

    ambientMaxLatOffset: 0.0002,
    ambientMaxLngOffset: 0.0002,

    
    forwardSpeedMinZoom: 13.5, // The zoom level where speed is at its minimum
    forwardSpeedMaxZoom: 16, // The zoom level where speed is at its maximum
    forwardSpeedAtMinZoom: isMobile ? 0.01 : 0.012, // The slower speed when zoomed out
    forwardSpeedAtMaxZoom: isMobile ? 0.026 : 0.035,

    forwardMovementSpeed: isMobile ? 0.05 : 0.04,
    forwardMovementDamping: 0.94,

    // Smoothness enhancement
    globalSmoothness: 0.85,
    stopThreshold: 0.001,

    // Boundary settings
    boundaryBounceFactor: 0.3,
    boundaryResistance: 0.8,

    dynamicPitchEnabled: true,
    minPitchValue: 60,    

    maxPitchValue: 60,   // Maximum pitch when fully zoomed in
    pitchZoomThresholdLow: 11,  // Zoom level where pitch starts decreasing

    pitchZoomThresholdHigh: 15,
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

  const playInitialZoom = (duration) => {
      const finalDuration = duration ?? 3000;
      isAnimationLockedRef.current = true;
      setSelectedId(null);
      setHoverInfo(null);
      setSelectedPin(null);      

      shouldStayAtPinPositionRef.current = false;
  
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
        pitch: 60,
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
        transitionInterpolator: new FlyToInterpolator(),
        onTransitionEnd: () => {
          setIsPinTransition(false); 
          isAnimationLockedRef.current = false; 
        }
      }));
    };

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // useEffect(() => {
  //   setViewState(INITIAL_VIEW_STATE);
  //   const timeout = setTimeout(() => {
  //     playInitialZoom();
  //   }, 1000);
  //   return () => clearTimeout(timeout);
  // }, []);

  useEffect(() => {
  setViewState(INITIAL_VIEW_STATE);
}, []);

// Hook 2: Trigger the animation ONLY when the map is confirmed to be ready.
// This hook will run when isMapLoaded changes from false to true.
useEffect(() => {
  if (isMapLoaded) {
    // We can add a tiny, optional delay here for better visual perception,
    // ensuring the user sees the initial state for a moment before the animation begins.
    const animationTimeout = setTimeout(() => {
      playInitialZoom();
    }, 100); // 100ms is a good starting point.
    
    return () => clearTimeout(animationTimeout);
  }
}, [isMapLoaded]);

  useEffect(() => {
    const handleWheel = (e) => {
      if (shouldStayAtPinPositionRef.current || isManualZoomRef.current) {
        return; // Don't enter wheel mode during manual zoom
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

        // Only enter wheel mode if we're actually scrolling, not just at zoom 16
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
}, [isInWheelMode, viewState.zoom]); // Add viewState.zoom as a dependency


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

      const deckCanvas = deckRef.current.deck.canvas;
      deckCanvas.addEventListener('deck.gl.viewState', updateTooltipPosition);

      return () => {
        deckCanvas.removeEventListener('deck.gl.viewState', updateTooltipPosition);
      };
    } else {
      setTooltipPos(null);
    }
  }, [selectedPin, viewState]);

  // Replace the ENTIRE useEffect that contains smoothUpdate with this one.

useEffect(() => {
    const smoothUpdate = () => {
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(smoothUpdate);
        return;
      }

      setViewState(prev => {
        if (isPinTransition) {
          // While flying to a pin, don't do any custom updates. Let Deck.gl handle it.
          return prev;
        }

        if (isInWheelMode) {
            // ... (The wheel mode logic remains unchanged)
            const progressDiff = wheelModeTargetProgressRef.current - wheelModeProgressRef.current;
            wheelModeProgressRef.current += progressDiff * 0.08;

            const START_ZOOM = 16;
            const END_ZOOM = isMobile ? 13.5 : 13.5;
            const START_PITCH = 60;
            const END_PITCH = 0;

            const lerp = (a, b, t) => a * (1 - t) + b * t;
            const newZoom = lerp(START_ZOOM, END_ZOOM, wheelModeProgressRef.current);
            const newPitch = lerp(START_PITCH, END_PITCH, wheelModeProgressRef.current);

            const currentLat = prev.latitude;
            const currentLng = prev.longitude;
            
            targetPositionRef.current.latitude = currentLat;
            targetPositionRef.current.longitude = currentLng;

            if (wheelModeProgressRef.current < 0.01 && wheelModeTargetProgressRef.current === 0) {
              setIsInWheelMode(false);
              baseZoomRef.current = prev.zoom;
              targetPositionRef.current.zoom = prev.zoom;
              if (prev.zoom >= 15.5) {
                targetViewRef.current.pitch = 60;
              }
            }

            return {
              ...prev,
              zoom: newZoom,
              pitch: newPitch,
              latitude: currentLat,
              longitude: currentLng,
              transitionDuration: 0,
            };
        }
        
        // --- START OF REFACTORED LOGIC ---

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
          // Drag logic remains the same
          newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, smoothnessSettings.dragLerpFactor);
          newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, smoothnessSettings.dragLerpFactor);
          newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, smoothnessSettings.dragLerpFactor);
          newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, smoothnessSettings.dragLerpFactor);

          if (isZoomDraggingRef.current) {
            const targetZoom = baseZoomRef.current + tempZoomOffsetRef.current;
            newZoom = smoothInterpolate(currentZoom, targetZoom, smoothnessSettings.dragLerpFactor);
          } else {
            newZoom = smoothInterpolate(currentZoom, baseZoomRef.current, smoothnessSettings.dragLerpFactor);
          }

          const clamped = clampToRadius(newLatitude, newLongitude);
          newLatitude = clamped.latitude;
          newLongitude = clamped.longitude;

          if (clamped.isAtBoundary) {
            leftDragVelocityRef.current.latitude *= smoothnessSettings.boundaryResistance;
            leftDragVelocityRef.current.longitude *= smoothnessSettings.boundaryResistance;
          }
        } else {
          // This is the new idle/inertia/ambient block
          let baseLatitude, baseLongitude, basePitch, baseBearing, baseZoom;

          // Step 1: Determine the BASE target for the camera
          if (shouldStayAtPinPositionRef.current) {
            // When locked to a pin, the "base" is always the pin's target location.
            baseLatitude = targetPositionRef.current.latitude;
            baseLongitude = targetPositionRef.current.longitude;
            basePitch = targetViewRef.current.pitch;
            baseBearing = targetViewRef.current.bearing;
            baseZoom = targetPositionRef.current.zoom;
            // Reset any leftover inertia to prevent drift away from the pin.
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          } else if (
            Math.abs(leftDragVelocityRef.current.bearing) > smoothnessSettings.stopThreshold ||
            Math.abs(leftDragVelocityRef.current.pitch) > smoothnessSettings.stopThreshold ||
            Math.abs(leftDragVelocityRef.current.latitude) > smoothnessSettings.stopThreshold ||
            Math.abs(leftDragVelocityRef.current.longitude) > smoothnessSettings.stopThreshold
          ) {
            // If not at a pin, but we have inertia, calculate the next position based on that.
            baseBearing = currentBearing + leftDragVelocityRef.current.bearing;
            basePitch = Math.max(0, Math.min(80, currentPitch + leftDragVelocityRef.current.pitch));
            let tempLat = currentLatitude + leftDragVelocityRef.current.latitude;
            let tempLng = currentLongitude + leftDragVelocityRef.current.longitude;
            const clamped = clampToRadius(tempLat, tempLng);
            baseLatitude = clamped.latitude;
            baseLongitude = clamped.longitude;
            if (clamped.isAtBoundary) {
              leftDragVelocityRef.current.latitude *= -smoothnessSettings.boundaryBounceFactor;
              leftDragVelocityRef.current.longitude *= -smoothnessSettings.boundaryBounceFactor;
            }
            baseZoom = currentZoom + leftDragVelocityRef.current.zoom;

            // Dampen the velocity for the next frame
            leftDragVelocityRef.current = {
              bearing: leftDragVelocityRef.current.bearing * smoothnessSettings.leftDampingFactor,
              pitch: leftDragVelocityRef.current.pitch * smoothnessSettings.leftDampingFactor,
              latitude: leftDragVelocityRef.current.latitude * smoothnessSettings.leftDampingFactor,
              longitude: leftDragVelocityRef.current.longitude * smoothnessSettings.leftDampingFactor,
              zoom: leftDragVelocityRef.current.zoom * smoothnessSettings.zoomDamping
            };
          } else {
            // If no inertia and not at a pin, the base is just the last known target.
            baseLatitude = targetPositionRef.current.latitude;
            baseLongitude = targetPositionRef.current.longitude;
            basePitch = targetViewRef.current.pitch;
            baseBearing = targetViewRef.current.bearing;
            baseZoom = targetPositionRef.current.zoom;
          }

          // Step 2: Apply AMBIENT movement as an offset to the BASE target
          if (ambientMovementEnabled) {
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
            
            // Zoom stays at the base level
            newZoom = currentZoom + (baseZoom - currentZoom) * smoothFactor;
          } else {
            // If ambient is disabled, just smoothly move to the base position
            const smoothFactor = smoothnessSettings.leftSmoothFactor;
            newPitch = currentPitch + (basePitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (baseBearing - currentBearing) * smoothFactor;
            const clamped = clampToRadius(baseLatitude, baseLongitude);
            newLatitude = currentLatitude + (clamped.latitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (clamped.longitude - currentLongitude) * smoothFactor;
            newZoom = currentZoom + (baseZoom - currentZoom) * smoothFactor;
          }
        }
        
        // Final clamping and state update
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
  }, [smoothnessSettings, ambientMovementEnabled, isInWheelMode, isPinTransition]); // Dependencies are correct
  
  useEffect(() => {
    const handleDragMovement = (x, y, buttons) => {
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
    // --- START: DYNAMIC ROTATION SPEED CALCULATION ---
    const currentZoom = baseZoomRef.current; // We'll use this for both calculations
    const {
        rotationSpeedMinZoom,
        rotationSpeedMaxZoom,
        rotationSpeedAtMinZoom,
        rotationSpeedAtMaxZoom
    } = smoothnessSettings;

    // 1. Calculate our progress through the zoom range for ROTATION
    const rotationZoomRange = rotationSpeedMaxZoom - rotationSpeedMinZoom;
    const rotationProgress = (currentZoom - rotationSpeedMinZoom) / (rotationZoomRange > 0 ? rotationZoomRange : 1);
    const clampedRotationProgress = Math.max(0, Math.min(1, rotationProgress));

    // 2. Interpolate to find the dynamic rotation speed for the current zoom level
    const dynamicRotationSpeed = rotationSpeedAtMinZoom + (rotationSpeedAtMaxZoom - rotationSpeedAtMinZoom) * clampedRotationProgress;
    
    // 3. Use this new dynamic speed in the bearing calculation
    targetViewRef.current = {
      ...targetViewRef.current,
      // Use the new dynamicRotationSpeed here instead of the old static value
      bearing: targetViewRef.current.bearing - deltaX * dynamicRotationSpeed
    };
    // --- END: DYNAMIC ROTATION SPEED CALCULATION ---

    isZoomDraggingRef.current = true;
    
    // --- This is your existing DYNAMIC FORWARD SPEED logic. It remains unchanged. ---
    const { 
        forwardSpeedMinZoom, 
        forwardSpeedMaxZoom, 
        forwardSpeedAtMinZoom, 
        forwardSpeedAtMaxZoom 
    } = smoothnessSettings;

    // Calculate how far we are through the zoom range for FORWARD MOVEMENT
    const zoomRange = forwardSpeedMaxZoom - forwardSpeedMinZoom;
    const progress = (currentZoom - forwardSpeedMinZoom) / (zoomRange > 0 ? zoomRange : 1);
    const clampedProgress = Math.max(0, Math.min(1, progress)); // Ensure it's between 0 and 1

    // Interpolate to find the dynamic speed for the current zoom level
    const dynamicForwardSpeed = forwardSpeedAtMinZoom + (forwardSpeedAtMaxZoom - forwardSpeedAtMinZoom) * clampedProgress;
    
    // Use this new dynamic speed in the existing movement calculation
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
}

      if (isDraggingRef.current) {
        dragPrevRef.current = { x, y };
      }
      if (isTouchDraggingRef.current) {
        touchPrevRef.current = { x, y };
      }
    };

    const commonDragEndLogic = (isTouchEvent = false) => {
  if (prevViewStateRef.current && viewState) {
    const bearingDelta = viewState.bearing - prevViewStateRef.current.bearing;
    const pitchDelta = (isDraggingRef.current && !isZoomDraggingRef.current && !isTouchEvent) ? (viewState.pitch - prevViewStateRef.current.pitch) : 0;
    const latDelta = viewState.latitude - prevViewStateRef.current.latitude;
    const lngDelta = viewState.longitude - prevViewStateRef.current.longitude;

    // Set multiplier to 1.0. We will control the speed with the clamps below.
    const inertiaMultiplier = 1.0; 

    const zoomVelocity = 0; // Keep this as 0 to prevent zoom drift

    // This is the key change: We enforce strict maximum speeds for the inertia.
    // No matter how fast the user flicks the mouse, the glide will start gently.
    leftDragVelocityRef.current = {
      bearing: clampVelocity(bearingDelta * inertiaMultiplier, 1.5),   // Max 1.5 degrees/frame rotation
      pitch: clampVelocity(pitchDelta * inertiaMultiplier, 1.0),     // Max 1.0 degree/frame tilt
      latitude: clampVelocity(latDelta * inertiaMultiplier, 0.0015), // Max 0.0015 degrees latitudinal drift
      longitude: clampVelocity(lngDelta * inertiaMultiplier, 0.0015),// Max 0.0015 degrees longitudinal drift
      zoom: zoomVelocity,
    };

    // CRITICAL FIX: Update baseZoomRef to current zoom to prevent snap-back
    baseZoomRef.current = viewState.zoom;
    targetPositionRef.current.zoom = viewState.zoom;
  }

  if (isTouchEvent) {
    isTouchDraggingRef.current = false;
  } else {
    isDraggingRef.current = false;
  }
  setIsDragging(false);
  isZoomDraggingRef.current = false;
  tempZoomOffsetRef.current = 0;
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
        // const dx = Math.abs(e.clientX - dragStartRef.current.x);
        // const dy = Math.abs(e.clientY - dragStartRef.current.y);
        // const dragThreshold = 5;

    
        // if (selectedId && (dx > dragThreshold || dy > dragThreshold)) {
    
        //   setSelectedId(null);
    
        //   setSelectedPin(null);
        //   if (hoverInfo) setHoverInfo(null);
        // }
        
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

          // *** FIX: Re-synchronize wheel mode progress with the current view state zoom ***
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
        // We still call preventDefault to stop the browser from scrolling the page.
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
        // const touch = e.changedTouches[0];
        // const dx = Math.abs(touch.clientX - touchStartRef.current.x);
        // const dy = Math.abs(touch.clientY - touchStartRef.current.y);
        // const dragThreshold = 10;

        // if (selectedId && (dx > dragThreshold || dy > dragThreshold)) {
        //   setSelectedId(null);
        //   setSelectedPin(null);
        //   if (hoverInfo) setHoverInfo(null);
        // }
        
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

  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.getElementsByTagName('head')[0].appendChild(meta);
    }
  }, []);

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


      onClick: (info) => {
        if (info.object) {
          isAnimationLockedRef.current = true; // Lock interactions

          setIsInWheelMode(false);
          wheelModeProgressRef.current = 0;
          wheelModeTargetProgressRef.current = 0;
          
          isZoomDraggingRef.current = false;
          tempZoomOffsetRef.current = 0;
          
          setIsPinTransition(true);
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

          setSelectedPin({
            name: info.object.properties.Name,
            longitude,
            latitude
          });

          setIsLoading(true);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }

          setHoverInfo({
            name: info.object.properties.Name,
            longitude,
            latitude
          });

          shouldStayAtPinPositionRef.current = true;
          setIsPinTransition(true);
          leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          floatingVelocityRef.current = { x: 0, y: 0 };
          const pinTargetZoom = 16;
          const pinTargetPitch = 60;
          const pinTargetBearing = -20;
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
            ...prev,
            longitude,
            latitude,
            zoom: pinTargetZoom,
            pitch: pinTargetPitch,
            bearing: pinTargetBearing,
            transitionDuration: 2000,
            transitionInterpolator: new FlyToInterpolator(),

            onTransitionEnd: () => {
              setSelectedId(pendingIdRef.current);
              shouldStayAtPinPositionRef.current = true;
              targetPositionRef.current = {
                latitude: latitude,
                longitude: longitude,
                zoom: pinTargetZoom
              };
              targetViewRef.current = {
                pitch: pinTargetPitch,
                bearing: pinTargetBearing
              };
              baseZoomRef.current = pinTargetZoom;

              loadingTimeoutRef.current = setTimeout(() => {
                setIsLoading(false);
                setIsPinTransition(false);
                isAnimationLockedRef.current = false;
              }, 500);
            }
          }));
        }
      },
      onDrag: () => {
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
          clearColor: [0.05, 0.05, 0.05, 1.0]
        }}
        onViewStateChange={({ viewState: newDeckViewState, interactionState }) => {
  setViewState(newDeckViewState);
  
  if (isPinTransition) {
    return; 
  }
  
  // ENHANCED FIX: Always keep references in sync when not actively manipulating
  if (!interactionState.inTransition && !isDraggingRef.current && !isTouchDraggingRef.current && !isInWheelMode) {
    targetPositionRef.current = {
      latitude: newDeckViewState.latitude,
      longitude: newDeckViewState.longitude,
      zoom: newDeckViewState.zoom
    };
    targetViewRef.current = {
      pitch: newDeckViewState.pitch,
      bearing: newDeckViewState.bearing,
    };
    baseZoomRef.current = newDeckViewState.zoom;
  }
  
  // ADDITIONAL FIX: Update during wheel mode to prevent position drift
  if (isInWheelMode && !isDraggingRef.current && !isTouchDraggingRef.current) {
    targetPositionRef.current.latitude = newDeckViewState.latitude;
    targetPositionRef.current.longitude = newDeckViewState.longitude;
    // Don't update zoom during wheel mode as it's being controlled by wheel progress
  }
}}
        onClick={info => {
          if (isAnimationLockedRef.current) {
            return;
          }

          if (!info.object) {
            setHoverInfo(null);
            setSelectedId(null);
            setSelectedPin(null);
            shouldStayAtPinPositionRef.current = false;
          }
        }}
        pickingRadius={30}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MapStyle}
          width="100%"
          height="100%"
          onLoad={() => {
            setIsLoading(false); // Keep your existing logic
            setIsMapLoaded(true); // Add the new readiness flag
          }}
        />
      </DeckGL>

       <div className="smoothness-controls" style={{
        position: 'absolute', bottom: '80px', right: '20px', background: 'rgba(0,0,0,0.8)',
        padding: '15px', color: 'white', borderRadius: '8px', zIndex: 1000,
        maxWidth: '320px', fontSize: '12px', display: isMobile ? 'none' : 'block',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
       
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Enhanced Camera Controls</h4>
        
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
        <div style={{marginBottom: '8px'}}>

          <label style={{display: 'block', marginBottom: '2px'}}>
            Forward Movement Speed: {smoothnessSettings.forwardMovementSpeed.toExponential(1)}
          </label>

          <input type="range" min="0.001" max="0.02" step="0.001"
            value={smoothnessSettings.forwardMovementSpeed}
            onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardMovementSpeed: parseFloat(e.target.value) }))}
          />

        </div>

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
                isManualZoomRef.current = true; 
                setViewState(prev => ({ ...prev, zoom: newZoom }));
                targetPositionRef.current.zoom = newZoom;
                baseZoomRef.current = newZoom; 
                setTimeout(() => {
                  isManualZoomRef.current = false;
                }, 100);
              }}

            />

          </div>
        </div>

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
            maxPitchValue: 60,
            pitchZoomThresholdLow: 8,
            pitchZoomThresholdHigh: 15,
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
      
{/* <div className="smoothness-controls" style={{
  position: 'absolute',
  bottom: '20px',
  right: '20px',
  background: 'rgba(0,0,0,0.8)',
  padding: '15px',
  color: 'white',
  borderRadius: '8px',
  zIndex: 1000,
  width: '300px',
  fontSize: '12px',
}}>
  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', textAlign: 'center' }}>
    Forward Movement ({isMobile ? 'Mobile' : 'Desktop'})
  </h4>
  
  <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
    <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#90e0ef' }}>Dynamic Speed by Zoom</h5>
    
    <div style={{marginBottom: '6px'}}>
      <label style={{display: 'block', marginBottom: '2px'}}>
        Min Speed at Zoom {smoothnessSettings.forwardSpeedMinZoom.toFixed(1)}: {smoothnessSettings.forwardSpeedAtMinZoom.toFixed(3)}
      </label>
      <input
        type="range"
        min="0.005"
        max="0.05"
        step="0.001"
        value={smoothnessSettings.forwardSpeedAtMinZoom}
        onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardSpeedAtMinZoom: parseFloat(e.target.value) }))}
      />
    </div>

    <div style={{marginBottom: '6px'}}>
      <label style={{display: 'block', marginBottom: '2px'}}>
        Max Speed at Zoom {smoothnessSettings.forwardSpeedMaxZoom.toFixed(1)}: {smoothnessSettings.forwardSpeedAtMaxZoom.toFixed(3)}
      </label>
      <input
        type="range"
        min="0.01"
        max="0.1"
        step="0.001"
        value={smoothnessSettings.forwardSpeedAtMaxZoom}
        onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardSpeedAtMaxZoom: parseFloat(e.target.value) }))}
      />
    </div>

    <div style={{marginBottom: '6px'}}>
      <label style={{display: 'block', marginBottom: '2px'}}>
        Min Zoom for Speed Change: {smoothnessSettings.forwardSpeedMinZoom.toFixed(1)}
      </label>
      <input
        type="range"
        min="8"
        max="14"
        step="0.5"
        value={smoothnessSettings.forwardSpeedMinZoom}
        onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardSpeedMinZoom: parseFloat(e.target.value) }))}
      />
    </div>

    <div style={{marginBottom: '6px'}}>
      <label style={{display: 'block', marginBottom: '2px'}}>
        Max Zoom for Speed Change: {smoothnessSettings.forwardSpeedMaxZoom.toFixed(1)}
      </label>
      <input
        type="range"
        min="14"
        max="18"
        step="0.5"
        value={smoothnessSettings.forwardSpeedMaxZoom}
        onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardSpeedMaxZoom: parseFloat(e.target.value) }))}
      />
    </div>
  </div>

  <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
    <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffdda1' }}>General Settings</h5>
    

    <div style={{marginBottom: '6px'}}>
      <label style={{display: 'block', marginBottom: '2px'}}>
        Movement Damping: {smoothnessSettings.forwardMovementDamping.toFixed(2)}
      </label>
      <input
        type="range"
        min="0.85"
        max="0.99"
        step="0.01"
        value={smoothnessSettings.forwardMovementDamping}
        onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardMovementDamping: parseFloat(e.target.value) }))}
      />
    </div>
  </div>
</div> */}
      {selectedPin && tooltipPos && ( <div className="tooltip tooltip-center-screen tooltip-visible tooltip-animate"> <strong>{selectedPin.name}</strong> <a href='#' target='_blank' rel="noopener noreferrer" style={{ color: '#fff', display: 'block' }}>Discover</a> </div> )}      
      <div className='live-back-btns'>
        <ul>
                    <li>
            <a
              href="#" style={{ display: 'block', width: '50px', height: '50px'}}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                setIsInWheelMode(false);
                wheelModeProgressRef.current = 0;
                wheelModeTargetProgressRef.current = 0;

                setIsPinTransition(true); 
                playInitialZoom(1500);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();

                setIsInWheelMode(false);
                wheelModeProgressRef.current = 0;
                wheelModeTargetProgressRef.current = 0;
                setIsPinTransition(true); 
                playInitialZoom(1500);
              }}
            >
              <img
                src={mapRevertIcon}
                alt="Map Revert"
                style={{
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              />
            </a>
          </li>
          <li>
            <a href="#" target='_blank'  rel="noopener noreferrer">
            <img src={liveTrackIcon} alt="Live Track" />
            </a>
          </li>
        </ul>
      </div>

      <style>{`
        body, html { margin: 0;
         padding: 0; 
         overflow: hidden; 
         width: 100%; 
         height: 100%; 
         position: fixed; }
        #root { width: 100%;
         height: 100%; 
         overflow: hidden; 
         position: fixed; }
        .live-back-btns { position: absolute; 
        top: 20px; 
        right: 20px; 
        z-index: 9999; }
        .live-back-btns ul { display: flex; 
        gap: 25px; 
        margin: 0; 
        padding: 0; 
        list-style: none; }
        .smoothness-controls::-webkit-scrollbar { width: 6px; }
        .smoothness-controls::-webkit-scrollbar-track { background: rgba(255,255,255,0.1);
         border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); 
        border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
        .tooltip { background: rgba(0,0,0, 0.3); padding: 25px 35px; border-radius: 12px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4); opacity: 0; transition: opacity 0.3s ease-out, transform 0.3s ease-out; z-index: 1001; text-align: center; color: white; }
        .tooltip-center-screen { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95); width: 70vw; min-height: 150px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        .tooltip strong { font-size: 72px;
         line-height: 78px; 
         display: block; 
         margin-bottom: 15px; } 
         .tooltip a { font-size: 18px; 
         line-height: 22px; 
         color: gold; 
         text-decoration: none; 
         padding: 8px 15px; 
         border: 0.5px solid gold; 
         border-radius: 5px; 
         transition: background-color 0.2s, 
         color 0.2s; } 
         .tooltip a:hover { background-color: gold; color: black; }
        .tooltip-visible { opacity: 1; } .tooltip-animate { animation: fadeInUpTooltipCentered 0.4s ease-out forwards; }
        @keyframes fadeInUpTooltipCentered { 0% { opacity: 0;
         transform: translate(-50%, -45%) scale(0.95); } 
         100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @media only screen and (max-width: 992px) { 
        .tooltip-center-screen { width: 70vw; padding: 20px; } 
        .tooltip strong { font-size: 46px; line-height: 60px;
         margin-bottom: 10px;} 
        .tooltip a { font-size: 16px; line-height: 20px; } }
        @media only screen and (max-width: 767px) {        
        .tooltip-center-screen { width: 80vw; 
        max-width: 
        280px; padding: 15px; } 
        .tooltip strong { font-size: 32px; 
        line-height: 46px; 
        margin-bottom: 8px;} 
        .tooltip a { font-size: 14px; 
        line-height: 18px; } }
      `}</style>
    </div>
  );
}

export default App;