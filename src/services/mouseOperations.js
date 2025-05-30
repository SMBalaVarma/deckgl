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
    leftDragBearingSensitivity: 0.20,
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
    ambientMaxLatOffset: 0.002,
    ambientMaxLngOffset: 0.001,
    forwardMovementSpeed: 0.06,
    forwardMovementDamping: 0.94,
    
    // Smoothness enhancement
    globalSmoothness: 0.85,
    stopThreshold: 0.001,

    // Boundary settings
    boundaryBounceFactor: 0.3,
    boundaryResistance: 0.8,

    dynamicPitchEnabled: true,
    minPitchValue: 0,    // Minimum pitch when fully zoomed out
    maxPitchValue: 75,   // Maximum pitch when fully zoomed in
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
      pitch: 75,
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

        if (isDraggingRef.current) {
          // When dragging starts, disable pin position staying
          shouldStayAtPinPositionRef.current = false;
          
          // Enhanced drag interpolation with momentum
          newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, smoothnessSettings.dragLerpFactor);
          newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, smoothnessSettings.dragLerpFactor);
          newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, smoothnessSettings.dragLerpFactor);
          newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, smoothnessSettings.dragLerpFactor);
          
          // Handle floating zoom effect during drag
          if (isZoomDraggingRef.current) {
            const targetZoom = baseZoomRef.current + tempZoomOffsetRef.current;
            newZoom = smoothInterpolate(currentZoom, targetZoom, smoothnessSettings.dragLerpFactor);
          } else {
            newZoom = smoothInterpolate(currentZoom, targetPositionRef.current.zoom, smoothnessSettings.dragLerpFactor);
          }

          // Apply radius restriction
          const clamped = clampToRadius(newLatitude, newLongitude);
          newLatitude = clamped.latitude;
          newLongitude = clamped.longitude;
          
          // Add resistance when at boundary
          if (clamped.isAtBoundary) {
            leftDragVelocityRef.current.latitude *= smoothnessSettings.boundaryResistance;
            leftDragVelocityRef.current.longitude *= smoothnessSettings.boundaryResistance;
          }
        } else {
          // Enhanced inertia with better damping and zoom support
          if (Math.abs(leftDragVelocityRef.current.bearing) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.pitch) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.latitude) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.longitude) > smoothnessSettings.stopThreshold ||
              Math.abs(leftDragVelocityRef.current.zoom) > smoothnessSettings.stopThreshold) {
            
            newBearing = currentBearing + leftDragVelocityRef.current.bearing;
            newPitch = Math.max(0, Math.min(85, currentPitch + leftDragVelocityRef.current.pitch));
            
            // Apply velocity first, then clamp to radius
            let tempLat = currentLatitude + leftDragVelocityRef.current.latitude;
            let tempLng = currentLongitude + leftDragVelocityRef.current.longitude;
            const clamped = clampToRadius(tempLat, tempLng);
            newLatitude = clamped.latitude;
            newLongitude = clamped.longitude;
            
            // Add resistance when at boundary
            if (clamped.isAtBoundary) {
              leftDragVelocityRef.current.latitude *= smoothnessSettings.boundaryResistance;
              leftDragVelocityRef.current.longitude *= smoothnessSettings.boundaryResistance;
            }
            
            // Smooth zoom return with velocity
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

            // Enhanced damping
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
            // Enhanced ambient movement with floating effect
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
            
            // Calculate ambient target position and clamp to radius
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
            // Standard smooth interpolation with radius restriction
            const smoothFactor = smoothnessSettings.leftSmoothFactor;
            newPitch = currentPitch + (targetViewRef.current.pitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (targetViewRef.current.bearing - currentBearing) * smoothFactor;
            
            // Calculate target position and clamp to radius
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
        
        // ... (previous parts of smoothUpdate)

        // This replaces the existing block for zoom updates when not staying at a pin,
        // typically handled during inertia or ambient phases.
        if (!shouldStayAtPinPositionRef.current) {
          // Apply zoom velocity from inertia
          newZoom = currentZoom + leftDragVelocityRef.current.zoom;

          const targetStableZoom = SMOOTH_DRAG_ZOOM_LEVEL;
          const zoomDiffToStable = targetStableZoom - newZoom;

          // Determine if we should snap to the stable zoom level
          // Increased snap threshold for robustness (e.g., from 0.05 to 0.08 or 0.1)
          // Also check if velocity is low or moving towards the target
          const snapThreshold = 0.08; 
          const nearStableZoom = Math.abs(zoomDiffToStable) < snapThreshold;
          const velocityLowOrCorrectDirection = 
            Math.abs(leftDragVelocityRef.current.zoom) < 0.01 || 
            (leftDragVelocityRef.current.zoom !== 0 && Math.sign(leftDragVelocityRef.current.zoom) === Math.sign(zoomDiffToStable));

          if (nearStableZoom && velocityLowOrCorrectDirection) {
            newZoom = targetStableZoom;
            leftDragVelocityRef.current.zoom = 0;
            tempZoomOffsetRef.current = 0; // Ensure this is reset
            baseZoomRef.current = targetStableZoom; // Critical for subsequent drags
            
            if (!isAtSmoothDragZoom) {
              setIsAtSmoothDragZoom(true);
            }
          } else {
            // Apply damping to existing zoom velocity
            leftDragVelocityRef.current.zoom *= smoothnessSettings.zoomDamping;

            // Apply spring force to pull zoom towards the stable level
            // You can make the spring factor (0.03 here) a smoothnessSetting if needed
            leftDragVelocityRef.current.zoom += zoomDiffToStable * 0.03; // Increased from 0.02

            // If velocity becomes extremely small and still not at target, stop it to prevent micro-jitters
            if (Math.abs(leftDragVelocityRef.current.zoom) < 0.0001) {
              leftDragVelocityRef.current.zoom = 0;
            }
            
            if (isAtSmoothDragZoom) {
              setIsAtSmoothDragZoom(false);
            }
          }
        } else {
          // When shouldStayAtPinPositionRef.current is true (staying at pin)
          newZoom = currentZoom; // Maintain current zoom (should be pin's zoom)
          
          // Ensure baseZoomRef is consistent with the pin's target zoom.
          // targetPositionRef.current.zoom is updated when flying to a pin.
          if (baseZoomRef.current !== targetPositionRef.current.zoom) {
            baseZoomRef.current = targetPositionRef.current.zoom;
          }
          leftDragVelocityRef.current.zoom = 0; // No zoom velocity when locked to a pin
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
  }, [smoothnessSettings, ambientMovementEnabled]);

    // Enhanced mouse movement tracking with velocity calculation
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
      getSize: d => (d.id === selectedId ? 15 : 8),
      getColor: [255, 140, 0], 

onClick: info => {
  if (info.object) {
    const coords = info.coordinate || info.object.geometry.coordinates;
    if (!coords || coords.length < 2) return;      
    const [longitude, latitude] = coords;
    const clickedId = info.object.id;      
    pendingIdRef.current = clickedId;

    setSelectedPin({
      name: info.object.properties.Name,
      longitude,
      latitude
    });

    // Set loading state
    setIsLoading(true);
    
    // Clear any existing loading timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }

    setHoverInfo({
      name: info.object.properties.Name,
      longitude,
      latitude
    });

    // Flag to stay at pin position during transition
    shouldStayAtPinPositionRef.current = true;
    setIsPinTransition(true);

    // Reset velocities for smooth transition
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };

    setViewState(prev => ({
      ...prev,
      longitude,
      latitude,
      zoom: 16, 
      pitch: 65,
      bearing: prev.bearing ,
      transitionDuration: 2000,
      transitionInterpolator: new FlyToInterpolator(),
      onTransitionEnd: () => {
        setSelectedId(pendingIdRef.current);
        shouldStayAtPinPositionRef.current = true;
        
        // Set base zoom to 16 when at pin
        baseZoomRef.current = 16;
        
        loadingTimeoutRef.current = setTimeout(() => {
          setIsLoading(false);
          setIsPinTransition(false);
        }, 500);
      }            
    }));
  } else {
    setHoverInfo(null);
    setSelectedId(null);
    setSelectedId(null);
    shouldStayAtPinPositionRef.current = false;
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
        onClick={info => {
          if (!info.object) {
            setHoverInfo(null);
            setSelectedId(null);
            shouldStayAtPinPositionRef.current = false;
          }
        }}
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
  {/* {smoothnessSettings.dynamicPitchEnabled && (
    <>
      <div style={{marginBottom: '6px'}}>
        <label style={{display: 'block', marginBottom: '2px'}}>
          Min Pitch (Zoomed Out): {smoothnessSettings.minPitchValue.toFixed(0)}°
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
          Max Pitch (Zoomed In): {smoothnessSettings.maxPitchValue.toFixed(0)}°
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
          Low Zoom Threshold: {smoothnessSettings.pitchZoomThresholdLow.toFixed(1)}
        </label>
        <input
          type="range"
          min="8"
          max="16"
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
          High Zoom Threshold: {smoothnessSettings.pitchZoomThresholdHigh.toFixed(1)}
        </label>
        <input
          type="range"
          min="13.5"
          max="30"
          step="0.5"
          value={smoothnessSettings.pitchZoomThresholdHigh}
          onChange={(e) => setSmoothnessSettings(s => ({ 
            ...s, 
            pitchZoomThresholdHigh: parseFloat(e.target.value) 
          }))}
        />
      </div>
    </>
  )} */}
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
      {selectedPin && tooltipPos && (
  <div
    className="tooltip tooltip-visible tooltip-animate"
    style={{
      position: 'absolute',
      left: tooltipPos.x,
      top: tooltipPos.y,
      zIndex: 1001
    }}
  >
    <strong>{selectedPin.name}</strong>
    <a href='#' target='_blank' rel="noopener noreferrer" style={{ color: '#fff', display: 'block' }}>Discover</a>
  </div>
)}
      
      <div className='live-back-btns'>
        <ul>
          <li><a href="#" onClick={(e) => {
            e.preventDefault();
            playInitialZoom(1000);
          }}><img src={mapRevertIcon} alt="Map" /></a></li>
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
        .tooltip {
          background: rgba(0,0,0, 0.6);
          padding: 15px 25px;
          border-radius: 8px;
          box-shadow: 0 6px 15px rgba(0, 0, 0, 0.3);
          opacity: 0;
          transition: opacity 0.3s ease-out, transform 0.3s ease-out;
          z-index: 1001;
          text-align: center;
          color: white;
        }
        .tooltip strong { font-size: 28px; line-height: 32px; display: block; margin-bottom: 5px; }
        .tooltip a { font-size: 16px; line-height: 20px; color: #eee; text-decoration: underline; }
        .tooltip-visible { opacity: 1; transform: translate(-50%, -120%) scale(1); }
        .tooltip-animate { animation: fadeInUpTooltip 0.3s ease-out; }
        @keyframes fadeInUpTooltip {
          0% { opacity: 0; transform: translate(-50%, -110%) scale(0.95); }
          100% { opacity: 1; transform: translate(-50%, -120%) scale(1); }
        }
        @media only screen and (max-width: 992px) {
          .tooltip strong { font-size: 22px; line-height: 26px; }
          .tooltip a { font-size: 14px; line-height: 18px; }
          .tooltip { padding: 10px 15px; }
        }
        @media only screen and (max-width: 767px) {
          .tooltip strong { font-size: 18px; line-height: 22px; }
          .tooltip a { font-size: 12px; line-height: 16px; }
        }
      `}</style>
    </div>
  );
}

export default App;