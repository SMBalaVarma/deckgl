import React, { useState, useEffect, useRef } from 'react';
import DeckGL, { IconLayer, PathLayer } from 'deck.gl';
import { FlyToInterpolator } from '@deck.gl/core';
import { isMobile } from 'react-device-detect';
import Map from 'react-map-gl/mapbox';
import NationalParksData from './data.json';
import mapIcon from './gold-pointer.png';
import mapRevertIcon from './map-revert.png';
import liveTrackIcon from './livetrack.png';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';
const iconUrl = mapIcon;

const CENTER_POINT = { latitude: 33.6095571, longitude: -84.8039517 };
const MAX_RADIUS = 0.03;
const BOUNDARY_COLOR = [255, 255, 255, 100];

const INITIAL_VIEW_STATE = {
  latitude: CENTER_POINT.latitude, longitude: CENTER_POINT.longitude, zoom: 3,
  pitch: 60, bearing: -30, maxZoom: 20, minZoom: 1
};

function App() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const deckRef = useRef();
  const [selectedId, setSelectedId] = useState(null);
  const pendingIdRef = useRef(null);
  const mouseInfluenceRef = useRef({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const loadingTimeoutRef = useRef();
  const [isDragging, setIsDragging] = useState(false);
  const dragPrevRef = useRef({ x: 0, y: 0 });
  const [isPinTransition, setIsPinTransition] = useState(false);
  const [pitchSmoothness, setPitchSmoothness] = useState(0.05);
  const [selectedPin, setSelectedPin] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [hoverInfo, setHoverInfo] = useState(null);


  const targetViewRef = useRef({ pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing });
  const animationFrameRef = useRef();
  const prevViewStateRef = useRef(null);
  const isDraggingRef = useRef(false);
  const leftDragVelocityRef = useRef({ bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 });
  const [ambientMovementEnabled, setAmbientMovementEnabled] = useState(true);
  const ambientInfluenceRef = useRef({ x: 0, y: 0 });
  const floatingVelocityRef = useRef({ x: 0, y: 0 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const lastMouseTimeRef = useRef(Date.now());
  const touchPrevRef = useRef({ x: 0, y: 0 });
  const isTouchDraggingRef = useRef(false);
  const targetPositionRef = useRef({ latitude: INITIAL_VIEW_STATE.latitude, longitude: INITIAL_VIEW_STATE.longitude, zoom: INITIAL_VIEW_STATE.zoom });
  const baseZoomRef = useRef(INITIAL_VIEW_STATE.zoom);
  const tempZoomOffsetRef = useRef(0);
  const isZoomDraggingRef = useRef(false);
  const canvasRef = useRef(); // Keep if used for other purposes, otherwise can be removed if only for tooltip event (which is now fixed)
  const wrapperRef = useRef();
  const shouldStayAtPinPositionRef = useRef(false);
  const [isAtSmoothDragZoom, setIsAtSmoothDragZoom] = useState(false);
  const SMOOTH_DRAG_ZOOM_LEVEL = 15.5;
  const deckInteractionStateRef = useRef({ inTransition: false });

  const [smoothnessSettings, setSmoothnessSettings] = useState({
    floatingStrength: 0.03, floatingDamping: 0.98, floatingMaxInfluence: 15, mouseVelocityInfluence: 0.01,
    leftDampingFactor: 0.92, leftDragBearingSensitivity: 0.20, leftSmoothFactor: 0.08, dragLerpFactor: 0.02,
    verticalZoomSensitivity: 0.001, zoomFloatRange: 1, zoomReturnSpeed: 0.1, zoomReturnDamping: 0.85, zoomReturnCurve: 2.0, zoomDamping: 0.88,
    minZoom: 11, maxZoom: 16,
    ambientStrength: 0.02, ambientMaxPitch: 0.1, ambientMaxBearing: 0.2, ambientSmoothness: 0.98,
    ambientMaxLatOffset: 0.002, ambientMaxLngOffset: 0.001,
    forwardMovementSpeed: 0.06, forwardMovementDamping: 0.94,
    globalSmoothness: 0.85, stopThreshold: 0.001,
    boundaryBounceFactor: 0.3, boundaryResistance: 0.8,
    dynamicPitchEnabled: true, minPitchValue: 0, maxPitchValue: 75,
    pitchZoomThresholdLow: 11, pitchZoomThresholdHigh: 14,
  });

  const clampToRadius = (lat, lng) => { /* ... unchanged ... */ 
    const latDiff = lat - CENTER_POINT.latitude;
    const lngDiff = (lng - CENTER_POINT.longitude) * Math.cos(CENTER_POINT.latitude * Math.PI / 180);
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    if (distance <= MAX_RADIUS) return { latitude: lat, longitude: lng, isAtBoundary: false };
    const angle = Math.atan2(lngDiff, latDiff);
    return {
      latitude: CENTER_POINT.latitude + MAX_RADIUS * Math.cos(angle),
      longitude: CENTER_POINT.longitude + (MAX_RADIUS * Math.sin(angle)) / Math.cos(CENTER_POINT.latitude * Math.PI / 180),
      isAtBoundary: true
    };
  };
  const clampVelocity = (v, max) => Math.max(-max, Math.min(max, v));
  const smoothInterpolate = (curr, targ, fact, mom = 0) => curr + (targ - curr) * fact + mom;

  const playInitialZoom = (duration) => { /* ... largely unchanged, ensure selectedPin is cleared ... */
    setSelectedId(null); setHoverInfo(null); setSelectedPin(null); // Clear selectedPin
    setIsPinTransition(false); shouldStayAtPinPositionRef.current = false;
    baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL; tempZoomOffsetRef.current = 0;
    isZoomDraggingRef.current = false; setIsAtSmoothDragZoom(true);
    targetPositionRef.current = { latitude: CENTER_POINT.latitude, longitude: CENTER_POINT.longitude, zoom: SMOOTH_DRAG_ZOOM_LEVEL };
    targetViewRef.current = { pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing };
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };
    setViewState(prev => ({
      ...prev, longitude: CENTER_POINT.longitude, latitude: CENTER_POINT.latitude, zoom: SMOOTH_DRAG_ZOOM_LEVEL,
      pitch: 75, bearing: -20, transitionDuration: duration ?? 5000, transitionInterpolator: new FlyToInterpolator(),
      onTransitionEnd: () => {
        targetPositionRef.current = { latitude: CENTER_POINT.latitude, longitude: CENTER_POINT.longitude, zoom: SMOOTH_DRAG_ZOOM_LEVEL };
        targetViewRef.current = { pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing };
        baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL; shouldStayAtPinPositionRef.current = false;
      }
    }));
  };

  useEffect(() => () => { if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current); }, []);
  useEffect(() => { const t = setTimeout(playInitialZoom, 300); return () => clearTimeout(t); }, []);

  useEffect(() => { // Tooltip positioning
    if (selectedPin && deckRef.current && deckRef.current.deck) {
      const updateTooltipPosition = () => {
        if (deckRef.current && deckRef.current.deck) {
          const viewports = deckRef.current.deck.getViewports();
          if (viewports && viewports.length > 0) {
            const viewport = viewports[0];
            const [x, y] = viewport.project([selectedPin.longitude, selectedPin.latitude]);
            setTooltipPos({ x, y });
          }
        }
      };
      updateTooltipPosition();
      const deckCanvas = deckRef.current.deck.canvas;
      if (deckCanvas) deckCanvas.addEventListener('deck.gl.viewState', updateTooltipPosition);
      return () => { if (deckCanvas) deckCanvas.removeEventListener('deck.gl.viewState', updateTooltipPosition); };
    } else { setTooltipPos(null); }
  }, [selectedPin, viewState]);


  useEffect(() => { // smoothUpdateLoop
    const smoothUpdateLoop = () => {
      if (document.hidden || deckInteractionStateRef.current.inTransition) {
        animationFrameRef.current = requestAnimationFrame(smoothUpdateLoop);
        return;
      }
      setViewState(prev => {
        const { pitch: currentPitch, bearing: currentBearing, latitude: currentLatitude, longitude: currentLongitude, zoom: currentZoom } = prev;
        prevViewStateRef.current = { ...prev };
        let newPitch = currentPitch, newBearing = currentBearing, newLatitude = currentLatitude, newLongitude = currentLongitude, newZoom = currentZoom;

        if (isDraggingRef.current || isTouchDraggingRef.current) {
          shouldStayAtPinPositionRef.current = false;
          newPitch = smoothInterpolate(currentPitch, targetViewRef.current.pitch, smoothnessSettings.dragLerpFactor);
          newBearing = smoothInterpolate(currentBearing, targetViewRef.current.bearing, smoothnessSettings.dragLerpFactor);
          newLatitude = smoothInterpolate(currentLatitude, targetPositionRef.current.latitude, smoothnessSettings.dragLerpFactor);
          newLongitude = smoothInterpolate(currentLongitude, targetPositionRef.current.longitude, smoothnessSettings.dragLerpFactor);
          if (isZoomDraggingRef.current) newZoom = smoothInterpolate(currentZoom, baseZoomRef.current + tempZoomOffsetRef.current, smoothnessSettings.dragLerpFactor);
          else newZoom = smoothInterpolate(currentZoom, targetPositionRef.current.zoom, smoothnessSettings.dragLerpFactor);
          const clampedDrag = clampToRadius(newLatitude, newLongitude);
          newLatitude = clampedDrag.latitude; newLongitude = clampedDrag.longitude;
          if (clampedDrag.isAtBoundary) { leftDragVelocityRef.current.latitude *= smoothnessSettings.boundaryResistance; leftDragVelocityRef.current.longitude *= smoothnessSettings.boundaryResistance; }
        } else { // Not dragging
          if (Object.values(leftDragVelocityRef.current).some(v => Math.abs(v) > smoothnessSettings.stopThreshold)) { // Inertia
            newBearing = currentBearing + leftDragVelocityRef.current.bearing;
            let pitchAfterInertia = Math.max(0, Math.min(85, currentPitch + leftDragVelocityRef.current.pitch));
            let tempLatInertia = currentLatitude + leftDragVelocityRef.current.latitude;
            let tempLngInertia = currentLongitude + leftDragVelocityRef.current.longitude;
            const clampedInertia = clampToRadius(tempLatInertia, tempLngInertia);
            newLatitude = clampedInertia.latitude; newLongitude = clampedInertia.longitude;

            leftDragVelocityRef.current = {
              bearing: leftDragVelocityRef.current.bearing * smoothnessSettings.leftDampingFactor,
              pitch: leftDragVelocityRef.current.pitch * smoothnessSettings.leftDampingFactor,
              latitude: (clampedInertia.isAtBoundary ? leftDragVelocityRef.current.latitude * smoothnessSettings.boundaryResistance : leftDragVelocityRef.current.latitude) * smoothnessSettings.leftDampingFactor,
              longitude: (clampedInertia.isAtBoundary ? leftDragVelocityRef.current.longitude * smoothnessSettings.boundaryResistance : leftDragVelocityRef.current.longitude) * smoothnessSettings.leftDampingFactor,
              zoom: leftDragVelocityRef.current.zoom // Zoom velocity handled later
            };
            
            if (shouldStayAtPinPositionRef.current) {
              newPitch = pitchAfterInertia; // View pitch shows inertia
              // Target pitch remains fixed (e.g. 65). Target bearing might also be fixed or follow inertia.
              // For now, assume target bearing is also fixed when at a pin.
              targetViewRef.current = { pitch: targetViewRef.current.pitch, bearing: targetViewRef.current.bearing };
            } else {
              newPitch = pitchAfterInertia;
              targetViewRef.current = { pitch: newPitch, bearing: newBearing };
            }
            // Position target always updated by inertia
            targetPositionRef.current = { ...targetPositionRef.current, latitude: newLatitude, longitude: newLongitude };
            // Zoom during inertia (if not staying at pin)
            if (!shouldStayAtPinPositionRef.current) {
                newZoom = currentZoom + leftDragVelocityRef.current.zoom;
            } else {
                newZoom = targetPositionRef.current.zoom; // Should be pin's zoom
                leftDragVelocityRef.current.zoom = 0;
            }

          } else if (ambientMovementEnabled && !isPinTransition && !shouldStayAtPinPositionRef.current) { // Ambient
            const { pitch: basePitch, bearing: baseBearing } = targetViewRef.current;
            const { latitude: baseLatitude, longitude: baseLongitude } = targetPositionRef.current;
            const mouseInfluenceX = mouseInfluenceRef.current.x + mouseVelocityRef.current.x * smoothnessSettings.mouseVelocityInfluence;
            const mouseInfluenceY = mouseInfluenceRef.current.y + mouseVelocityRef.current.y * smoothnessSettings.mouseVelocityInfluence;
            floatingVelocityRef.current.x = clampVelocity(floatingVelocityRef.current.x + mouseInfluenceX * smoothnessSettings.floatingStrength, smoothnessSettings.floatingMaxInfluence) * smoothnessSettings.floatingDamping;
            floatingVelocityRef.current.y = clampVelocity(floatingVelocityRef.current.y + mouseInfluenceY * smoothnessSettings.floatingStrength, smoothnessSettings.floatingMaxInfluence) * smoothnessSettings.floatingDamping;
            const ambientTargetPitch = Math.max(0, Math.min(85, basePitch + mouseInfluenceY * smoothnessSettings.ambientMaxPitch + floatingVelocityRef.current.y));
            const ambientTargetBearing = baseBearing + mouseInfluenceX * smoothnessSettings.ambientMaxBearing + floatingVelocityRef.current.x;
            const clampedAmbient = clampToRadius(baseLatitude + mouseInfluenceY * smoothnessSettings.ambientMaxLatOffset + floatingVelocityRef.current.y * 0.001, baseLongitude + mouseInfluenceX * smoothnessSettings.ambientMaxLngOffset + floatingVelocityRef.current.x * 0.001);
            const smoothFactor = 1 - smoothnessSettings.ambientSmoothness;
            newPitch = currentPitch + (ambientTargetPitch - currentPitch) * smoothFactor;
            newBearing = currentBearing + (ambientTargetBearing - currentBearing) * smoothFactor;
            newLatitude = currentLatitude + (clampedAmbient.latitude - currentLatitude) * smoothFactor;
            newLongitude = currentLongitude + (clampedAmbient.longitude - currentLongitude) * smoothFactor;
            newZoom = baseZoomRef.current; tempZoomOffsetRef.current = 0;
          } else { // Settling to target / Staying at pin with no other forces
            const settleSmoothFactor = shouldStayAtPinPositionRef.current ? 0.35 : smoothnessSettings.leftSmoothFactor; // Faster settle at pin

            if (shouldStayAtPinPositionRef.current && !isPinTransition) {
              newPitch = targetViewRef.current.pitch; // DIRECT SET for PITCH at PIN

              newBearing = currentBearing + (targetViewRef.current.bearing - currentBearing) * settleSmoothFactor;
              if (Math.abs(targetViewRef.current.bearing - newBearing) < 0.01) newBearing = targetViewRef.current.bearing;
              newLatitude = currentLatitude + (targetPositionRef.current.latitude - currentLatitude) * settleSmoothFactor;
              if (Math.abs(targetPositionRef.current.latitude - newLatitude) < 0.00001) newLatitude = targetPositionRef.current.latitude;
              newLongitude = currentLongitude + (targetPositionRef.current.longitude - currentLongitude) * settleSmoothFactor;
              if (Math.abs(targetPositionRef.current.longitude - newLongitude) < 0.00001) newLongitude = targetPositionRef.current.longitude;
              newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * settleSmoothFactor;
              if (Math.abs(targetPositionRef.current.zoom - newZoom) < 0.01) newZoom = targetPositionRef.current.zoom;
            } else if (!isPinTransition) { // General settling
              newPitch = currentPitch + (targetViewRef.current.pitch - currentPitch) * settleSmoothFactor;
              newBearing = currentBearing + (targetViewRef.current.bearing - currentBearing) * settleSmoothFactor;
              let targetLat = currentLatitude + (targetPositionRef.current.latitude - currentLatitude) * settleSmoothFactor;
              let targetLng = currentLongitude + (targetPositionRef.current.longitude - currentLongitude) * settleSmoothFactor;
              const clampedSettle = clampToRadius(targetLat, targetLng);
              newLatitude = clampedSettle.latitude; newLongitude = clampedSettle.longitude;
              newZoom = currentZoom + (targetPositionRef.current.zoom - currentZoom) * settleSmoothFactor;
            } else { /* In pin transition, viewState driven by DeckGL */ }
            if (!(isDraggingRef.current || isTouchDraggingRef.current || isPinTransition) && Math.abs(newZoom - targetPositionRef.current.zoom) < 0.1) { baseZoomRef.current = targetPositionRef.current.zoom; }
          }
        }

        // Zoom stabilization logic (mostly for free exploration, not when locked to pin's zoom)
        if (!shouldStayAtPinPositionRef.current && !(isDraggingRef.current || isTouchDraggingRef.current)) {
          const zoomDiffToStable = SMOOTH_DRAG_ZOOM_LEVEL - newZoom;
          if (Math.abs(zoomDiffToStable) < 0.08 && (Math.abs(leftDragVelocityRef.current.zoom) < 0.01 || Math.sign(leftDragVelocityRef.current.zoom) === Math.sign(zoomDiffToStable))) {
            newZoom = SMOOTH_DRAG_ZOOM_LEVEL; leftDragVelocityRef.current.zoom = 0; tempZoomOffsetRef.current = 0; baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL;
            if (!isAtSmoothDragZoom) setIsAtSmoothDragZoom(true);
          } else {
            leftDragVelocityRef.current.zoom = (leftDragVelocityRef.current.zoom * smoothnessSettings.zoomDamping) + (zoomDiffToStable * 0.03);
            if (Math.abs(leftDragVelocityRef.current.zoom) < 0.0001) leftDragVelocityRef.current.zoom = 0;
            if (isAtSmoothDragZoom) setIsAtSmoothDragZoom(false);
          }
        } else if (shouldStayAtPinPositionRef.current) {
            // If at pin, zoom should already be set to targetPositionRef.current.zoom by settling logic or inertia handling
            if (baseZoomRef.current !== targetPositionRef.current.zoom) baseZoomRef.current = targetPositionRef.current.zoom;
            leftDragVelocityRef.current.zoom = 0;
        }
        
        newPitch = Math.max(0, Math.min(80, newPitch)); // Final clamp for pitch
        newZoom = Math.max(smoothnessSettings.minZoom, Math.min(smoothnessSettings.maxZoom, newZoom));
        return { ...prev, pitch: newPitch, bearing: newBearing, latitude: newLatitude, longitude: newLongitude, zoom: newZoom, transitionDuration: 0 };
      });
      animationFrameRef.current = requestAnimationFrame(smoothUpdateLoop);
    };
    animationFrameRef.current = requestAnimationFrame(smoothUpdateLoop);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [smoothnessSettings, ambientMovementEnabled, isPinTransition, isAtSmoothDragZoom]); // isAtSmoothDragZoom added as it's set inside

  useEffect(() => { /* ... Event handlers (mousedown, mouseup, etc.) ... unchanged for this fix */ 
    const handleDragMovement = (x, y, buttons) => { 
        const prevX = (isDraggingRef.current && !isTouchDraggingRef.current) ? dragPrevRef.current.x : touchPrevRef.current.x;
        const prevY = (isDraggingRef.current && !isTouchDraggingRef.current) ? dragPrevRef.current.y : touchPrevRef.current.y;
        const deltaX = x - prevX; const deltaY = y - prevY;
        if (buttons === 2 && isDraggingRef.current) {
          targetViewRef.current = { pitch: Math.max(0, Math.min(85, targetViewRef.current.pitch - deltaY * 0.25)), bearing: targetViewRef.current.bearing - deltaX * 0.35 };
        } else if (buttons === 1) {
          targetViewRef.current = { ...targetViewRef.current, bearing: targetViewRef.current.bearing - deltaX * smoothnessSettings.leftDragBearingSensitivity };
          isZoomDraggingRef.current = true;
          tempZoomOffsetRef.current = Math.max(-smoothnessSettings.zoomFloatRange, Math.min(smoothnessSettings.zoomFloatRange, tempZoomOffsetRef.current + (deltaY * smoothnessSettings.verticalZoomSensitivity)));
          const bearingRad = (targetViewRef.current.bearing * Math.PI) / 180;
          const moveDistance = deltaY * (smoothnessSettings.forwardMovementSpeed / Math.pow(2, baseZoomRef.current) * 100) * 0.5;
          const clamped = clampToRadius(targetPositionRef.current.latitude + Math.cos(bearingRad) * moveDistance, targetPositionRef.current.longitude + Math.sin(bearingRad) * moveDistance);
          targetPositionRef.current = { ...targetPositionRef.current, latitude: clamped.latitude, longitude: clamped.longitude };
          if (clamped.isAtBoundary) tempZoomOffsetRef.current *= 0.5;
        }
        if (isDraggingRef.current && !isTouchDraggingRef.current) dragPrevRef.current = { x, y }; else if (isTouchDraggingRef.current) touchPrevRef.current = { x, y };
    };
    const commonDragEndLogic = (isTouchEvent = false) => { 
        if (prevViewStateRef.current && viewState) {
            const { bearing: pBearing, pitch: pPitch, latitude: pLat, longitude: pLng } = prevViewStateRef.current;
            const { bearing: cBearing, pitch: cPitch, latitude: cLat, longitude: cLng } = viewState; // Use current viewState
            const inertiaMultiplier = 1.2; let zoomVelocity = 0;
            if (!shouldStayAtPinPositionRef.current) {
              const zoomDiffToStable = SMOOTH_DRAG_ZOOM_LEVEL - (baseZoomRef.current + tempZoomOffsetRef.current);
              if (Math.abs(zoomDiffToStable) > 0.01) zoomVelocity = zoomDiffToStable * 0.05;
            }
            leftDragVelocityRef.current = {
              bearing: clampVelocity((cBearing - pBearing) * inertiaMultiplier, 8),
              pitch: clampVelocity(((isDraggingRef.current && !isZoomDraggingRef.current && !isTouchEvent) ? (cPitch - pPitch) : 0) * inertiaMultiplier, 5),
              latitude: clampVelocity((cLat - pLat) * inertiaMultiplier, 0.1),
              longitude: clampVelocity((cLng - pLng) * inertiaMultiplier, 0.1),
              zoom: clampVelocity(zoomVelocity, 0.3)
            };
          }
          if (isTouchEvent) isTouchDraggingRef.current = false; else isDraggingRef.current = false;
          setIsDragging(false); isZoomDraggingRef.current = false; tempZoomOffsetRef.current = 0;
    };
    const handleMouseDown = (e) => {
        if (e.button === 0 || e.button === 2) {
            if (selectedId || selectedPin) { setSelectedId(null); setSelectedPin(null); setHoverInfo(null); }
            isDraggingRef.current = true; setIsDragging(true); dragPrevRef.current = { x: e.clientX, y: e.clientY };
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
            floatingVelocityRef.current = { x: 0, y: 0 }; shouldStayAtPinPositionRef.current = false;
            targetPositionRef.current = { latitude: viewState.latitude, longitude: viewState.longitude, zoom: viewState.zoom };
            targetViewRef.current = { pitch: viewState.pitch, bearing: viewState.bearing };
            baseZoomRef.current = viewState.zoom; tempZoomOffsetRef.current = 0;
            isZoomDraggingRef.current = (e.button === 0);
          }
    };
    const handleMouseUp = (e) => { if ((e.button === 0 || e.button === 2) && isDraggingRef.current) commonDragEndLogic(false); };
    const handleTouchStart = (e) => { 
        if (e.touches.length === 1) { e.preventDefault();
            if (selectedId || selectedPin) { setSelectedId(null); setSelectedPin(null); setHoverInfo(null); }
            const touch = e.touches[0]; isTouchDraggingRef.current = true; setIsDragging(true); touchPrevRef.current = { x: touch.clientX, y: touch.clientY };
            leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
            floatingVelocityRef.current = { x: 0, y: 0 }; shouldStayAtPinPositionRef.current = false;
            targetPositionRef.current = { latitude: viewState.latitude, longitude: viewState.longitude, zoom: viewState.zoom };
            targetViewRef.current = { pitch: viewState.pitch, bearing: viewState.bearing };
            baseZoomRef.current = viewState.zoom; tempZoomOffsetRef.current = 0; isZoomDraggingRef.current = true;
          }
    };
    const handleTouchEnd = (e) => { if (isTouchDraggingRef.current && e.touches.length === 0) commonDragEndLogic(true); };
    const handleMouseMove = (e) => { 
        if (ambientMovementEnabled && !isDraggingRef.current && !isTouchDraggingRef.current && !shouldStayAtPinPositionRef.current) {
            const { clientX: x, clientY: y } = e; const currentTime = Date.now(); const deltaTime = currentTime - lastMouseTimeRef.current;
            if (deltaTime > 0) {
              mouseVelocityRef.current.x = clampVelocity((x - lastMousePosRef.current.x) / deltaTime, 2);
              mouseVelocityRef.current.y = clampVelocity((y - lastMousePosRef.current.y) / deltaTime, 2);
            }
            lastMousePosRef.current = { x, y }; lastMouseTimeRef.current = currentTime;
            mouseInfluenceRef.current = { x: (x / window.innerWidth) * 2 - 1, y: (y / window.innerHeight) * 2 - 1 };
            ambientInfluenceRef.current = {
              x: ambientInfluenceRef.current.x * smoothnessSettings.ambientSmoothness + mouseInfluenceRef.current.x * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness),
              y: ambientInfluenceRef.current.y * smoothnessSettings.ambientSmoothness + mouseInfluenceRef.current.y * smoothnessSettings.ambientStrength * (1 - smoothnessSettings.ambientSmoothness)
            };
          }
          if (isDraggingRef.current && !isTouchDraggingRef.current) handleDragMovement(e.clientX, e.clientY, e.buttons || 1);
    };
    const handleTouchMove = (e) => { if (isTouchDraggingRef.current && e.touches.length === 1) { e.preventDefault(); handleDragMovement(e.touches[0].clientX, e.touches[0].clientY, 1); } };
    const preventDefaultContextMenu = (e) => e.preventDefault();
    window.addEventListener('mousedown', handleMouseDown); window.addEventListener('mouseup', handleMouseUp); window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: false }); window.addEventListener('touchend', handleTouchEnd, { passive: false }); window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('contextmenu', preventDefaultContextMenu);
    return () => { /* remove listeners */ 
      window.removeEventListener('mousedown', handleMouseDown); window.removeEventListener('mouseup', handleMouseUp); window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart); window.removeEventListener('touchend', handleTouchEnd); window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('contextmenu', preventDefaultContextMenu);
    };
  }, [viewState, smoothnessSettings, ambientMovementEnabled, selectedId, selectedPin]); // Key dependencies

  useEffect(() => { /* ... meta viewport ... unchanged */ 
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'; document.head.appendChild(meta); }
  }, []);

  const generateBoundaryCircle = () => Array.from({ length: 360 }, (_, i) => { const a = (i * Math.PI) / 180; return [CENTER_POINT.longitude + (MAX_RADIUS * Math.cos(a) / Math.cos(CENTER_POINT.latitude * Math.PI / 180)), CENTER_POINT.latitude + MAX_RADIUS * Math.sin(a)]; });

  const layers = [
    new PathLayer({ id: 'boundary-circle', data: [{ path: generateBoundaryCircle(), color: BOUNDARY_COLOR }], getPath: d => d.path, getColor: d => d.color, getWidth: 2, widthMinPixels: 1, pickable: false }),
    new IconLayer({
      id: 'nationalParksIcons', // Consider static ID for stability
      data: NationalParksData.features, pickable: true,
      getPosition: d => { const c = d.geometry.coordinates; return Array.isArray(c[0]) ? c[0] : c; },
      getIcon: () => ({ url: iconUrl, width: 143, height: 143, anchorY: 143 }),
      sizeScale: 9, 
      //getSize: d => (d.id === selectedId ? 15 : 8), // Simpler for now
      getSize: d => (d.id === selectedId ? 30 : (pendingIdRef.current === d.id && isPinTransition ? 30 : 8)), // Makes new pin big during transition
      getColor: [255, 140, 0],
      onClick: (info) => {
        if (info.object) {
          const coords = info.object.geometry.coordinates; if (!coords || coords.length < 2) return;
          const [longitude, latitude] = (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') ? coords[0] : coords;
          const clickedId = info.object.id;
          
          pendingIdRef.current = clickedId;
          setSelectedPin({ name: info.object.properties.Name, longitude, latitude });
          setIsLoading(true); if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          setHoverInfo({ name: info.object.properties.Name, longitude, latitude });
          
          shouldStayAtPinPositionRef.current = true; setIsPinTransition(true);
          leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
          floatingVelocityRef.current = { x: 0, y: 0 };
          
          const pinTargetZoom = 16, pinTargetPitch = 60, pinTargetBearing = 20;
          targetPositionRef.current = { latitude, longitude, zoom: pinTargetZoom };
          targetViewRef.current = { pitch: pinTargetPitch, bearing: pinTargetBearing };
          baseZoomRef.current = pinTargetZoom;
          
          setViewState(prev => ({
            ...prev, longitude, latitude, zoom: pinTargetZoom, pitch: pinTargetPitch, bearing: pinTargetBearing,
            transitionDuration: 1500, transitionInterpolator: new FlyToInterpolator({speed: 1.5}),
            onTransitionEnd: () => {
              setSelectedId(pendingIdRef.current);
              shouldStayAtPinPositionRef.current = true;
              targetPositionRef.current = { latitude, longitude, zoom: pinTargetZoom }; // Ensure correct target
              targetViewRef.current = { pitch: pinTargetPitch, bearing: pinTargetBearing }; // Ensure correct target
              baseZoomRef.current = pinTargetZoom;
              loadingTimeoutRef.current = setTimeout(() => { setIsLoading(false); setIsPinTransition(false); }, 100);
            },
            onTransitionInterrupt: () => { setIsPinTransition(false); /* Or handle more gracefully */ }
          }));
        }
      }
    })
  ].filter(Boolean);

  return (
    <div ref={wrapperRef} style={{ /* ... styles ... */ position: 'relative', width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', backgroundColor: '#1a1a2e' }}>
      {/* <canvas ref={canvasRef} ... /> */} {/* Removed canvasRef as it's not used unless for other drawings */}
      <DeckGL
        ref={deckRef} viewState={viewState}
        controller={{ dragPan: false, dragRotate: false, scrollZoom: false, touchZoom: false, touchRotate: false, doubleClickZoom: true, keyboard: false, inertia: false }}
        layers={layers} width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}
        parameters={{ clearColor: [0.05, 0.05, 0.05, 1.0] }}
        onViewStateChange={({ viewState: newDeckViewState, interactionState }) => {
          deckInteractionStateRef.current = interactionState; // Keep track of DeckGL's transition state
          if (interactionState.inTransition) {
            setViewState(newDeckViewState); // If DeckGL is transitioning, let it update viewState
          } else { // DeckGL is idle or a transition just ended
            if (!(isDraggingRef.current || isTouchDraggingRef.current)) { // If not user-dragging
              if (!shouldStayAtPinPositionRef.current) { // And not supposed to stay at a pin
                // Update our targets from DeckGL's settled state (for free exploration)
                targetPositionRef.current = { latitude: newDeckViewState.latitude, longitude: newDeckViewState.longitude, zoom: newDeckViewState.zoom };
                targetViewRef.current = { pitch: newDeckViewState.pitch, bearing: newDeckViewState.bearing };
              }
              // If shouldStayAtPinPositionRef.current is true, targets are already set (e.g. to pin's 65 pitch)
              // and should not be overwritten by newDeckViewState here.
            }
            setViewState(newDeckViewState); // Always update React's viewState to reflect DeckGL
          }
        }}
        onClick={info => { if (!info.object) { setSelectedId(null); setSelectedPin(null); setHoverInfo(null); shouldStayAtPinPositionRef.current = false; /* playInitialZoom(); */ } }}
        pickingRadius={30}
      >
        <Map mapboxAccessToken={MAPBOX_TOKEN} mapStyle={MapStyle} width="100%" height="100%" onLoad={() => setIsLoading(false)} />
      </DeckGL>
      {/* ... UI Controls, Tooltip, Styles ... (largely unchanged) ... */}
      <div className="smoothness-controls" style={{ position: 'absolute', bottom: '80px', right: '20px', background: 'rgba(0,0,0,0.8)', padding: '15px', color: 'white', borderRadius: '8px', zIndex: 1000, maxWidth: '320px', fontSize: '12px', display: isMobile ? 'none' : 'block', maxHeight: '80vh', overflowY: 'auto' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Enhanced Camera Controls</h4>
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffd700' }}>Floating Movement</h5>
          <div><label>Floating Strength: {smoothnessSettings.floatingStrength.toFixed(2)}</label><input type="range" min="0.01" max="0.2" step="0.01" value={smoothnessSettings.floatingStrength} onChange={(e) => setSmoothnessSettings(s => ({ ...s, floatingStrength: parseFloat(e.target.value) }))} /></div>
          <div><label>Floating Damping: {smoothnessSettings.floatingDamping.toFixed(2)}</label><input type="range" min="0.85" max="0.98" step="0.01" value={smoothnessSettings.floatingDamping} onChange={(e) => setSmoothnessSettings(s => ({ ...s, floatingDamping: parseFloat(e.target.value) }))} /></div>
          <div><label>Mouse Velocity Influence: {smoothnessSettings.mouseVelocityInfluence.toFixed(2)}</label><input type="range" min="0.01" max="1.0" step="0.01" value={smoothnessSettings.mouseVelocityInfluence} onChange={(e) => setSmoothnessSettings(s => ({ ...s, mouseVelocityInfluence: parseFloat(e.target.value) }))} /></div>
        </div>
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#87ceeb' }}>Drag Controls</h5>
          <div><label>Rotation Sensitivity: {smoothnessSettings.leftDragBearingSensitivity.toFixed(2)}</label><input type="range" min="0.05" max="0.5" step="0.01" value={smoothnessSettings.leftDragBearingSensitivity} onChange={(e) => setSmoothnessSettings(s => ({ ...s, leftDragBearingSensitivity: parseFloat(e.target.value) }))} /></div>
          <div><label>Drag Smoothness: {smoothnessSettings.dragLerpFactor.toFixed(2)}</label><input type="range" min="0.01" max="0.3" step="0.01" value={smoothnessSettings.dragLerpFactor} onChange={(e) => setSmoothnessSettings(s => ({ ...s, dragLerpFactor: parseFloat(e.target.value) }))} /></div>
          <div><label>Inertia Damping: {smoothnessSettings.leftDampingFactor.toFixed(2)}</label><input type="range" min="0.8" max="0.98" step="0.01" value={smoothnessSettings.leftDampingFactor} onChange={(e) => setSmoothnessSettings(s => ({ ...s, leftDampingFactor: parseFloat(e.target.value) }))} /></div>
        </div>
        <div><label>Forward Movement Speed: {smoothnessSettings.forwardMovementSpeed.toExponential(1)}</label><input type="range" min="0.001" max="0.1" step="0.001" value={smoothnessSettings.forwardMovementSpeed} onChange={(e) => setSmoothnessSettings(s => ({ ...s, forwardMovementSpeed: parseFloat(e.target.value) }))} /></div>
        <div><label><input type="checkbox" checked={ambientMovementEnabled} onChange={(e) => setAmbientMovementEnabled(e.target.checked)} /> Enable Enhanced Ambient Movement</label></div>
        {ambientMovementEnabled && (<div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#dda0dd' }}>Ambient Settings</h5>
          <div><label>Ambient Strength: {smoothnessSettings.ambientStrength.toFixed(2)}</label><input type="range" min="0.01" max="0.15" step="0.01" value={smoothnessSettings.ambientStrength} onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientStrength: parseFloat(e.target.value) }))} /></div>
          <div><label>Max Pitch Effect: {smoothnessSettings.ambientMaxPitch.toFixed(1)}°</label><input type="range" min="0.1" max="2" step="0.1" value={smoothnessSettings.ambientMaxPitch} onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxPitch: parseFloat(e.target.value) }))} /></div>
          <div><label>Max Bearing Effect: {smoothnessSettings.ambientMaxBearing.toFixed(1)}°</label><input type="range" min="0.1" max="3" step="0.1" value={smoothnessSettings.ambientMaxBearing} onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientMaxBearing: parseFloat(e.target.value) }))} /></div>
          <div><label>Ambient Smoothness: {smoothnessSettings.ambientSmoothness.toFixed(2)}</label><input type="range" min="0.85" max="0.99" step="0.01" value={smoothnessSettings.ambientSmoothness} onChange={(e) => setSmoothnessSettings(s => ({ ...s, ambientSmoothness: parseFloat(e.target.value) }))} /></div>
        </div>)}
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffa500' }}>Manual Controls</h5>
          <div><label>Camera Pitch: {viewState.pitch.toFixed(1)}°</label><input type="range" min="0" max="85" step="1" value={viewState.pitch} onChange={(e) => { const v = parseFloat(e.target.value); shouldStayAtPinPositionRef.current = false; targetViewRef.current.pitch = v; setViewState(p => ({ ...p, pitch: v, transitionDuration: 0 })); }} /></div>
          <div><label>Camera Bearing: {viewState.bearing.toFixed(1)}°</label><input type="range" min="-180" max="180" step="1" value={viewState.bearing} onChange={(e) => { const v = parseFloat(e.target.value); shouldStayAtPinPositionRef.current = false; targetViewRef.current.bearing = v; setViewState(p => ({ ...p, bearing: v, transitionDuration: 0 })); }} /></div>
          <div><label>Zoom Level: {viewState.zoom.toFixed(1)}</label><input type="range" min={smoothnessSettings.minZoom} max={smoothnessSettings.maxZoom} step="0.1" value={viewState.zoom} onChange={(e) => { const v = parseFloat(e.target.value); shouldStayAtPinPositionRef.current = false; targetPositionRef.current.zoom = v; baseZoomRef.current = v; setViewState(p => ({ ...p, zoom: v, transitionDuration: 0 })); }} /></div>
        </div>
        <div><label>Global Smoothness: {smoothnessSettings.globalSmoothness.toFixed(2)}</label><input type="range" min="0.7" max="0.95" step="0.05" value={smoothnessSettings.globalSmoothness} onChange={(e) => setSmoothnessSettings(s => ({ ...s, globalSmoothness: parseFloat(e.target.value) }))} /></div>
        <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px'}}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ff9966' }}>Dynamic Pitch Controls</h5>
          <div><label><input type="checkbox" checked={smoothnessSettings.dynamicPitchEnabled} onChange={(e) => setSmoothnessSettings(s => ({ ...s, dynamicPitchEnabled: e.target.checked }))} /> Enable Dynamic Pitch</label></div>
          <div><label>Min Zoom Level: {smoothnessSettings.pitchZoomThresholdLow.toFixed(1)}</label><input type="range" min="1" max="13" step="0.5" value={smoothnessSettings.pitchZoomThresholdLow} onChange={(e) => setSmoothnessSettings(s => ({ ...s, pitchZoomThresholdLow: parseFloat(e.target.value) }))} /></div>
          <div><label>Min Pitch: {smoothnessSettings.minPitchValue.toFixed(0)}°</label><input type="range" min="0" max="45" step="1" value={smoothnessSettings.minPitchValue} onChange={(e) => setSmoothnessSettings(s => ({ ...s, minPitchValue: parseFloat(e.target.value) }))} /></div>
          <div><label>Max Pitch: {smoothnessSettings.maxPitchValue.toFixed(0)}°</label><input type="range" min="30" max="85" step="1" value={smoothnessSettings.maxPitchValue} onChange={(e) => setSmoothnessSettings(s => ({ ...s, maxPitchValue: parseFloat(e.target.value) }))} /></div>
          <div><label>Pitch Transition Speed: {(pitchSmoothness * 100).toFixed(0)}%</label><input type="range" min="0.01" max="0.2" step="0.01" value={pitchSmoothness} onChange={(e) => setPitchSmoothness(parseFloat(e.target.value))} /></div>
        </div>
        <button onClick={() => { setSmoothnessSettings({ /* ... defaults ... */ floatingStrength: 0.03, floatingDamping: 0.98, floatingMaxInfluence: 15, mouseVelocityInfluence: 0.01, leftDampingFactor: 0.92, leftDragBearingSensitivity: 0.20, leftSmoothFactor: 0.08, dragLerpFactor: 0.02, verticalZoomSensitivity: 0.001, zoomFloatRange: 1, zoomReturnSpeed: 0.1, zoomReturnDamping: 0.85, zoomReturnCurve: 2.0, zoomDamping: 0.88, minZoom: 11, maxZoom: 16, ambientStrength: 0.02, ambientMaxPitch: 0.1, ambientMaxBearing: 0.2, ambientSmoothness: 0.98, ambientMaxLatOffset: 0.002, ambientMaxLngOffset: 0.001, forwardMovementSpeed: 0.06, forwardMovementDamping: 0.94, globalSmoothness: 0.85, stopThreshold: 0.001, boundaryBounceFactor: 0.3, boundaryResistance: 0.8, dynamicPitchEnabled: true, minPitchValue: 0, maxPitchValue: 75, pitchZoomThresholdLow: 11, pitchZoomThresholdHigh: 14, }); setPitchSmoothness(0.05); }} style={{ width: '100%', padding: '8px', background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Reset to Defaults</button>
      </div>
      {selectedPin && tooltipPos && ( <div className="tooltip tooltip-center-screen tooltip-visible tooltip-animate"> <strong>{selectedPin.name}</strong> <a href='#' target='_blank' rel="noopener noreferrer" style={{ color: '#fff', display: 'block' }}>Discover</a> </div> )}
      <div className='live-back-btns'> <ul> <li><a href="#" onClick={(e) => { e.preventDefault(); playInitialZoom(1000); }}><img src={mapRevertIcon} alt="Map" /></a></li> <li><a href="#" target='_blank' rel="noopener noreferrer"><img src={liveTrackIcon} alt="Live Track" /></a></li> </ul> </div>
      <style>{` /* ... CSS styles ... */
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; position: fixed; } #root { width: 100%; height: 100%; overflow: hidden; position: fixed; }
        .live-back-btns { position: absolute; top: 20px; right: 20px; z-index: 9999; } .live-back-btns ul { display: flex; gap: 25px; margin: 0; padding: 0; list-style: none; }
        .smoothness-controls::-webkit-scrollbar { width: 6px; } .smoothness-controls::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 3px; } .smoothness-controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; } .smoothness-controls::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
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